/* Sincronização na nuvem (Firebase Auth + Firestore).
   O app continua local-first: o localStorage responde na hora e a nuvem
   é sincronizada em segundo plano quando há login e internet.

   Estrutura no Firestore:
     usuarios/{uid}              { dados: JSON do estado (sem planos/diário), atualizadoEm }
     usuarios/{uid}/dias/{data}  { dados: JSON { plano, diario }, atualizadoEm } */

const VERSAO_SDK = '10.14.1';
const firebaseConfig = {
  apiKey: 'AIzaSyCgoz8t-8aeMGs9ONkx9f9BJqrSZMhtoKc',
  authDomain: 'caminhodosucesso-6f506.firebaseapp.com',
  projectId: 'caminhodosucesso-6f506',
  storageBucket: 'caminhodosucesso-6f506.firebasestorage.app',
  messagingSenderId: '526756543767',
  appId: '1:526756543767:web:67ae55de5196b4f8b20b52',
};
const CHAVE_SYNC = 'caminho-sucesso.sync';

const Nuvem = (() => {
  const estado = { disponivel: false, carregando: true, usuario: null, status: 'parado', ultimoSync: null, erro: null };
  let fb = null;      // { auth, db, A: módulo auth, F: módulo firestore }
  let meta = null;    // { uid, h: { principal, dias: {data: hash} }, ultimoPull, editado }
  let fila = Promise.resolve();
  let tEnvio;

  /* ---------- utilidades ---------- */
  const avisarApp = () => window.App?.aoMudarNuvem();
  const emFila = fn => (fila = fila.then(fn).catch(tratarErro));

  function hash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36) + '.' + s.length.toString(36);
  }
  function partes(st) {
    const { planos, diario, ...resto } = st;
    const dias = {};
    new Set([...Object.keys(planos), ...Object.keys(diario)]).forEach(d => {
      dias[d] = JSON.stringify({ plano: planos[d] || null, diario: diario[d] || null });
    });
    return { principal: JSON.stringify(resto), dias };
  }
  // "Quanto progresso" um dia tem — usado para resolver conflitos entre aparelhos
  function pesoDia(json) {
    if (!json) return -1;
    const { plano, diario } = JSON.parse(json);
    return (plano?.tarefas.filter(t => t.status !== 'pendente').length || 0) +
      Object.values(diario || {}).filter(v => v !== '' && v != null).length;
  }
  function aplicarDia(st, d, { plano, diario }) {
    if (plano) st.planos[d] = plano; else delete st.planos[d];
    if (diario) st.diario[d] = diario; else delete st.diario[d];
  }
  const lerMeta = () => { try { return JSON.parse(localStorage.getItem(CHAVE_SYNC)); } catch (e) { return null; } };
  const gravarMeta = () => { try { localStorage.setItem(CHAVE_SYNC, JSON.stringify(meta)); } catch (e) { /* sem armazenamento */ } };
  const docPrincipal = () => fb.F.doc(fb.db, 'usuarios', estado.usuario.uid);
  const colDias = () => fb.F.collection(fb.db, 'usuarios', estado.usuario.uid, 'dias');

  function definirStatus(status, erro = null) {
    estado.status = status; estado.erro = erro;
    if (status === 'ok') estado.ultimoSync = Date.now();
    avisarApp();
  }

  function tratarErro(e) {
    console.error('[nuvem]', e);
    const c = e?.code || '';
    let msg = 'Falha na sincronização. Tentaremos de novo automaticamente.';
    if (c.includes('permission-denied')) msg = 'Acesso negado pelo Firestore. Publique as regras de segurança (arquivo firestore.rules) no console do Firebase.';
    else if (c.includes('unavailable') || !navigator.onLine) msg = 'Sem conexão. Seus dados estão salvos no aparelho e serão enviados quando a internet voltar.';
    else if (c.includes('not-found') || c.includes('failed-precondition')) msg = 'O banco Firestore ainda não foi criado neste projeto. Crie-o no console do Firebase.';
    definirStatus('erro', msg);
  }

  /* ---------- envio (local → nuvem) ---------- */
  async function enviar() {
    if (!estado.usuario || !meta) return;
    const { F } = fb;
    const p = partes(window.App.estado);
    const lote = F.writeBatch(fb.db);
    const agora = Date.now();
    const novos = { principal: null, dias: {} };
    let n = 0;

    const hp = hash(p.principal);
    if (hp !== meta.h.principal) {
      lote.set(docPrincipal(), { dados: p.principal, atualizadoEm: agora });
      novos.principal = hp; n++;
    }
    for (const [d, json] of Object.entries(p.dias)) {
      if (n >= 450) break; // limite de 500 operações por lote; o restante vai no próximo ciclo
      const hd = hash(json);
      if (hd === meta.h.dias[d]) continue;
      lote.set(F.doc(colDias(), d), { dados: json, atualizadoEm: agora });
      novos.dias[d] = hd; n++;
    }
    if (!n) { definirStatus('ok'); return; }

    definirStatus('sincronizando');
    await lote.commit();
    if (novos.principal) meta.h.principal = novos.principal;
    Object.assign(meta.h.dias, novos.dias);
    gravarMeta();
    definirStatus('ok');
    if (n >= 450) emFila(enviar);
  }

  /* ---------- recebimento (nuvem → local) ---------- */
  async function puxar() {
    const { F } = fb;
    definirStatus('sincronizando');
    const [snapP, snapDias] = await Promise.all([
      F.getDoc(docPrincipal()),
      F.getDocs(F.query(colDias(), F.where('atualizadoEm', '>=', meta.ultimoPull))),
    ]);
    let st = window.App.estado;
    const local = partes(st);
    let maxT = meta.ultimoPull, mudou = false;

    if (snapP.exists()) {
      const r = snapP.data();
      const hr = hash(r.dados);
      if (r.atualizadoEm >= meta.ultimoPull && hr !== meta.h.principal) {
        const sujo = hash(local.principal) !== meta.h.principal;
        if (!sujo || r.atualizadoEm > meta.editado) {
          st = { ...JSON.parse(r.dados), planos: st.planos, diario: st.diario };
          meta.h.principal = hr; mudou = true;
        }
      }
      maxT = Math.max(maxT, r.atualizadoEm);
    }
    snapDias.forEach(doc => {
      const r = doc.data(), d = doc.id, hr = hash(r.dados);
      maxT = Math.max(maxT, r.atualizadoEm);
      if (hr === meta.h.dias[d]) return;
      const lj = local.dias[d];
      const sujo = lj && hash(lj) !== meta.h.dias[d];
      const pr = pesoDia(r.dados), pl = pesoDia(lj);
      if (!sujo || pr > pl || (pr === pl && r.atualizadoEm > meta.editado)) {
        aplicarDia(st, d, JSON.parse(r.dados));
        meta.h.dias[d] = hr; mudou = true;
      }
    });
    meta.ultimoPull = maxT;
    gravarMeta();
    if (mudou) window.App.substituir(st);
    definirStatus('ok');
  }

  /* ---------- primeira sincronização deste aparelho com a conta ---------- */
  async function primeiraSync() {
    const { F } = fb;
    definirStatus('sincronizando');
    const [snapP, snapDias] = await Promise.all([F.getDoc(docPrincipal()), F.getDocs(colDias())]);
    meta = { uid: estado.usuario.uid, h: { principal: null, dias: {} }, ultimoPull: 0, editado: 0 };

    if (!snapP.exists()) {               // conta nova: envia o que está no aparelho
      gravarMeta();
      if (window.App.estado.perfil) await enviar(); else definirStatus('ok');
      return;
    }

    const remoto = { principal: snapP.data(), dias: [] };
    snapDias.forEach(doc => remoto.dias.push({ id: doc.id, ...doc.data() }));
    meta.h.principal = hash(remoto.principal.dados);
    meta.ultimoPull = remoto.principal.atualizadoEm;
    remoto.dias.forEach(r => {
      meta.h.dias[r.id] = hash(r.dados);
      meta.ultimoPull = Math.max(meta.ultimoPull, r.atualizadoEm);
    });

    const local = window.App.estado;
    const usarRemoto = !local.perfil || confirm(
      'Encontramos dados salvos na sua conta.\n\n' +
      'OK = usar os dados da nuvem neste aparelho\n' +
      'Cancelar = manter os dados deste aparelho e substituir os da nuvem');

    if (usarRemoto) {
      const st = { ...JSON.parse(remoto.principal.dados), planos: {}, diario: {} };
      remoto.dias.forEach(r => aplicarDia(st, r.id, JSON.parse(r.dados)));
      gravarMeta();
      window.App.substituir(st);          // pode gerar o plano de hoje → enviado em seguida
      await enviar();
      toast('Dados da nuvem restaurados neste aparelho.');
    } else {
      // apaga da nuvem os dias que não existem neste aparelho
      const locais = partes(local).dias;
      const lote = F.writeBatch(fb.db);
      let n = 0;
      remoto.dias.forEach(r => {
        if (!locais[r.id] && n < 450) { lote.delete(F.doc(colDias(), r.id)); delete meta.h.dias[r.id]; n++; }
      });
      if (n) await lote.commit();
      gravarMeta();
      await enviar();
      toast('Dados deste aparelho enviados para a nuvem.');
    }
  }

  /* ---------- API pública ---------- */
  function agendar() {
    if (!meta || !estado.usuario) return;
    meta.editado = Date.now(); gravarMeta();
    clearTimeout(tEnvio);
    tEnvio = setTimeout(() => emFila(enviar), 1500);
  }

  function sincronizar() {
    if (!estado.usuario || !meta) return;
    emFila(async () => { await puxar(); await enviar(); });
  }

  async function entrar() {
    if (!estado.disponivel) return toast(estado.erro || 'Sincronização indisponível no momento.');
    const { A, auth } = fb;
    const provedor = new A.GoogleAuthProvider();
    provedor.setCustomParameters({ prompt: 'select_account' });
    try {
      await A.signInWithPopup(auth, provedor);
    } catch (e) {
      const c = e.code || '';
      if (c === 'auth/popup-blocked' || c === 'auth/operation-not-supported-in-this-environment') {
        return A.signInWithRedirect(auth, provedor);
      }
      if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') return;
      if (c === 'auth/unauthorized-domain') return toast(`Domínio não autorizado. Adicione "${location.hostname}" em Firebase → Authentication → Configurações → Domínios autorizados.`, 9000);
      if (c === 'auth/operation-not-allowed' || c === 'auth/configuration-not-found') return toast('Ative o login com Google em Firebase → Authentication → Método de login.', 9000);
      console.error(e); toast('Não foi possível entrar: ' + (e.message || c));
    }
  }

  async function sair() {
    if (!estado.usuario) return;
    if (!confirm('Sair da conta? Seus dados continuam salvos neste aparelho.')) return;
    await fb.A.signOut(fb.auth);
    toast('Você saiu da conta.');
  }

  // Desliga a sincronização deste aparelho sem tocar nos dados da nuvem
  function desconectar() {
    clearTimeout(tEnvio);
    meta = null;
    try { localStorage.removeItem(CHAVE_SYNC); } catch (e) { /* sem armazenamento */ }
    if (fb && estado.usuario) return fb.A.signOut(fb.auth);
  }

  async function iniciar() {
    if (location.protocol === 'file:') {
      estado.carregando = false;
      estado.erro = 'Para usar login e nuvem, abra o app por um endereço web (Firebase Hosting, GitHub Pages ou localhost).';
      return avisarApp();
    }
    try {
      const base = `https://www.gstatic.com/firebasejs/${VERSAO_SDK}/`;
      const [appM, A, F] = await Promise.all([
        import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js'),
      ]);
      const app = appM.initializeApp(firebaseConfig);
      fb = { auth: A.getAuth(app), db: F.getFirestore(app), A, F };
      fb.auth.languageCode = 'pt';
      estado.disponivel = true;
    } catch (e) {
      console.error(e);
      estado.carregando = false;
      estado.erro = 'Não foi possível carregar o Firebase. Verifique a internet — o app segue funcionando no aparelho.';
      return avisarApp();
    }

    fb.A.onAuthStateChanged(fb.auth, u => {
      estado.carregando = false;
      estado.usuario = u ? { uid: u.uid, nome: u.displayName, email: u.email, foto: u.photoURL } : null;
      if (!u) { meta = null; definirStatus('parado'); return; }
      avisarApp();
      emFila(async () => {
        const m = lerMeta();
        if (m && m.uid === u.uid) { meta = m; await puxar(); await enviar(); }
        else await primeiraSync();
      });
    });

    window.addEventListener('online', sincronizar);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) sincronizar(); });
    setInterval(() => { if (!document.hidden) sincronizar(); }, 120000);
  }

  iniciar();
  return { estado, entrar, sair, sincronizar, agendar, desconectar };
})();
window.Nuvem = Nuvem;

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
const CHAVE_ACESSO = 'caminho-sucesso.acesso';
// Precisa ser o mesmo e-mail definido em ehAdmin() no firestore.rules
const ADMIN_EMAIL = 'marcianofiscal85@gmail.com';

const Nuvem = (() => {
  /* acesso: verificando | indisponivel | offline | sem-login | sem-convite | liberado | erro */
  const estado = { disponivel: false, carregando: true, usuario: null, status: 'parado', ultimoSync: null, erro: null,
    acesso: 'verificando', admin: false, msgAcesso: null };
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
    if (c.includes('permission-denied')) {
      msg = 'Acesso negado pelo servidor.';
      verificarAcesso().catch(() => {}); // o acesso pode ter sido removido pelo administrador
    }
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
    if (!meta || !estado.usuario || estado.acesso !== 'liberado') return;
    meta.editado = Date.now(); gravarMeta();
    clearTimeout(tEnvio);
    tEnvio = setTimeout(() => emFila(enviar), 1500);
  }

  function sincronizar() {
    if (!estado.usuario || !meta || estado.acesso !== 'liberado') return;
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
    limparAcessoCache();
    await fb.A.signOut(fb.auth);
    toast('Você saiu da conta.');
  }

  // Desliga a sincronização deste aparelho sem tocar nos dados da nuvem
  function desconectar() {
    clearTimeout(tEnvio);
    meta = null;
    try { localStorage.removeItem(CHAVE_SYNC); } catch (e) { /* sem armazenamento */ }
    limparAcessoCache();
    if (fb && estado.usuario) return fb.A.signOut(fb.auth);
  }

  /* ---------- Controle de acesso por convite ----------
     A proteção real está no firestore.rules; aqui só refletimos o estado na interface.
     Um "cache" local permite abrir o app offline depois que o acesso já foi confirmado. */
  const lerAcessoCache = () => { try { return JSON.parse(localStorage.getItem(CHAVE_ACESSO)); } catch (e) { return null; } };
  function gravarAcessoCache(uid) { try { localStorage.setItem(CHAVE_ACESSO, JSON.stringify({ uid, em: Date.now() })); } catch (e) { /* */ } }
  function limparAcessoCache() { try { localStorage.removeItem(CHAVE_ACESSO); } catch (e) { /* */ } }

  function definirAcesso(acesso, msg = null) {
    const antes = estado.acesso;
    estado.acesso = acesso; estado.msgAcesso = msg;
    if (acesso === 'liberado' && estado.usuario) gravarAcessoCache(estado.usuario.uid);
    if (acesso === 'sem-convite' || acesso === 'sem-login') limparAcessoCache();
    if (antes !== acesso || msg) avisarApp();
  }

  const offline = e => !navigator.onLine || /unavailable|offline|network/i.test((e?.code || '') + (e?.message || ''));

  async function verificarAcesso() {
    if (!estado.usuario) return definirAcesso('sem-login');
    if (estado.admin) return definirAcesso('liberado');
    try {
      const snap = await fb.F.getDoc(fb.F.doc(fb.db, 'membros', estado.usuario.uid));
      definirAcesso(snap.exists() ? 'liberado' : 'sem-convite');
    } catch (e) {
      const cache = lerAcessoCache();
      if (offline(e) && cache?.uid === estado.usuario.uid) return definirAcesso('liberado');
      if (offline(e)) return definirAcesso('offline', 'Sem conexão. Conecte-se à internet para confirmar seu acesso.');
      if ((e.code || '').includes('permission-denied')) return definirAcesso('sem-convite');
      console.error(e);
      definirAcesso('erro', 'Não foi possível verificar seu acesso. Tente novamente.');
    }
  }

  const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sem 0/O, 1/I/L para evitar confusão
  function gerarCodigo() {
    const out = [];
    const buf = new Uint32Array(1);
    while (out.length < 12) {
      crypto.getRandomValues(buf);
      if (buf[0] < Math.floor(4294967296 / ALFABETO.length) * ALFABETO.length) out.push(ALFABETO[buf[0] % ALFABETO.length]);
    }
    return `CS-${out.slice(0, 4).join('')}-${out.slice(4, 8).join('')}-${out.slice(8).join('')}`;
  }
  function normalizarCodigo(s) {
    const limpo = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return /^CS[A-Z0-9]{12}$/.test(limpo) ? `CS-${limpo.slice(2, 6)}-${limpo.slice(6, 10)}-${limpo.slice(10)}` : null;
  }

  async function resgatarConvite(entrada) {
    if (!estado.usuario) return { ok: false, msg: 'Entre com sua conta Google primeiro.' };
    const codigo = normalizarCodigo(entrada);
    if (!codigo) return { ok: false, msg: 'Código em formato inválido. Ele se parece com CS-XXXX-XXXX-XXXX.' };
    const { F, db } = fb;
    const email = (estado.usuario.email || '').toLowerCase();
    const refConvite = F.doc(db, 'convites', codigo);
    let convite;
    try {
      const snap = await F.getDoc(refConvite);
      if (!snap.exists()) throw { code: 'permission-denied' };
      convite = snap.data();
    } catch (e) {
      if (offline(e)) return { ok: false, msg: 'Sem conexão. Tente novamente com internet.' };
      return { ok: false, msg: `Este código não existe ou não foi emitido para ${email}. Confira o código e se você entrou com a conta Google certa.` };
    }
    if (convite.revogado) return { ok: false, msg: 'Este convite foi cancelado pelo administrador.' };
    if (convite.usado) return { ok: false, msg: 'Este convite já foi utilizado.' };
    if (convite.expiraEm.toMillis() < Date.now()) return { ok: false, msg: 'Este convite expirou. Peça um novo ao administrador.' };
    try {
      const lote = F.writeBatch(db);
      lote.set(F.doc(db, 'membros', estado.usuario.uid), { email, codigo, criadoEm: F.serverTimestamp() });
      lote.update(refConvite, { usado: true, usadoPor: estado.usuario.uid, usadoEm: F.serverTimestamp() });
      await lote.commit();
    } catch (e) {
      console.error(e);
      return { ok: false, msg: 'Não foi possível ativar o convite. Verifique se ele é válido para este e-mail.' };
    }
    definirAcesso('liberado');
    iniciarSync();
    return { ok: true };
  }

  /* ---------- Painel do administrador ---------- */
  function exigirAdmin() { if (!estado.admin) throw new Error('Apenas o administrador pode fazer isso.'); }

  async function gerarConvite(email, dias, nota) {
    exigirAdmin();
    email = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('E-mail inválido.');
    const { F, db } = fb;
    const codigo = gerarCodigo();
    const expiraEm = F.Timestamp.fromMillis(Date.now() + dias * 86400000);
    await F.setDoc(F.doc(db, 'convites', codigo), {
      email, nota: String(nota || '').slice(0, 200), criadoEm: F.serverTimestamp(), expiraEm, usado: false, revogado: false,
    });
    return { codigo, email, expiraEm: expiraEm.toMillis() };
  }
  async function listarConvites() {
    exigirAdmin();
    const { F, db } = fb;
    const snap = await F.getDocs(F.query(F.collection(db, 'convites'), F.orderBy('criadoEm', 'desc')));
    const out = [];
    snap.forEach(d => {
      const c = d.data();
      out.push({ codigo: d.id, ...c, criadoEm: c.criadoEm?.toMillis?.() || 0, expiraEm: c.expiraEm?.toMillis?.() || 0, usadoEm: c.usadoEm?.toMillis?.() || 0 });
    });
    return out;
  }
  async function revogarConvite(codigo) { exigirAdmin(); await fb.F.updateDoc(fb.F.doc(fb.db, 'convites', codigo), { revogado: true }); }
  async function excluirConvite(codigo) { exigirAdmin(); await fb.F.deleteDoc(fb.F.doc(fb.db, 'convites', codigo)); }
  async function listarMembros() {
    exigirAdmin();
    const snap = await fb.F.getDocs(fb.F.collection(fb.db, 'membros'));
    const out = [];
    snap.forEach(d => { const m = d.data(); out.push({ uid: d.id, ...m, criadoEm: m.criadoEm?.toMillis?.() || 0 }); });
    return out.sort((a, b) => b.criadoEm - a.criadoEm);
  }
  async function removerMembro(uid) { exigirAdmin(); await fb.F.deleteDoc(fb.F.doc(fb.db, 'membros', uid)); }

  function iniciarSync() {
    const u = estado.usuario;
    emFila(async () => {
      if (!u || estado.acesso !== 'liberado') return;
      const m = lerMeta();
      if (m && m.uid === u.uid) { meta = m; await puxar(); await enviar(); }
      else await primeiraSync();
    });
  }

  async function iniciar() {
    if (location.protocol === 'file:') {
      estado.carregando = false;
      estado.erro = 'Para usar login e nuvem, abra o app por um endereço web (Firebase Hosting, GitHub Pages ou localhost).';
      return definirAcesso('indisponivel', estado.erro);
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
      estado.erro = 'Sem conexão com a nuvem. Seus dados seguem salvos no aparelho.';
      // Sem internet: libera apenas quem já teve o acesso confirmado neste aparelho
      return lerAcessoCache() ? definirAcesso('liberado') : definirAcesso('offline', 'Sem conexão. Conecte-se à internet para o primeiro acesso.');
    }

    fb.A.onAuthStateChanged(fb.auth, async u => {
      estado.carregando = false;
      estado.usuario = u ? { uid: u.uid, nome: u.displayName, email: u.email, foto: u.photoURL } : null;
      estado.admin = !!u && u.emailVerified && (u.email || '').toLowerCase() === ADMIN_EMAIL;
      if (!u) { meta = null; definirStatus('parado'); definirAcesso('sem-login'); return; }
      definirAcesso('verificando');
      await verificarAcesso();
      iniciarSync();
    });

    window.addEventListener('online', sincronizar);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) sincronizar(); });
    setInterval(() => { if (!document.hidden) sincronizar(); }, 120000);
  }

  iniciar();
  return {
    estado, entrar, sair, sincronizar, agendar, desconectar, verificarAcesso, resgatarConvite, normalizarCodigo,
    gerarConvite, listarConvites, revogarConvite, excluirConvite, listarMembros, removerMembro,
  };
})();
window.Nuvem = Nuvem;

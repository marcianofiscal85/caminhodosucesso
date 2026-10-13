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

  /* ---------- Login: Google ou e-mail e senha ---------- */
  function erroAuth(e) {
    const c = e?.code || '';
    const msgs = {
      'auth/email-already-in-use': 'Já existe uma conta com este e-mail. Use a opção "Entrar".',
      'auth/invalid-email': 'E-mail inválido.',
      'auth/weak-password': 'Senha fraca. Use pelo menos 8 caracteres.',
      'auth/invalid-credential': 'E-mail ou senha incorretos.',
      'auth/wrong-password': 'E-mail ou senha incorretos.',
      'auth/user-not-found': 'E-mail ou senha incorretos.',
      'auth/user-disabled': 'Esta conta foi desativada.',
      'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
      'auth/network-request-failed': 'Sem conexão com a internet.',
      'auth/operation-not-allowed': 'Este método de login não está ativado no Firebase.',
      'auth/configuration-not-found': 'Este método de login não está ativado no Firebase.',
      'auth/unauthorized-domain': `Domínio não autorizado. Adicione "${location.hostname}" em Firebase → Authentication → Domínios autorizados.`,
      'auth/requires-recent-login': 'Por segurança, saia e entre novamente para fazer isso.',
    };
    if (!msgs[c]) console.error(e);
    return msgs[c] || 'Não foi possível concluir: ' + (e?.message || c);
  }
  const exigirDisponivel = () => { if (!estado.disponivel) throw { code: 'auth/network-request-failed' }; };

  async function entrarGoogle() {
    try {
      exigirDisponivel();
      const { A, auth } = fb;
      const provedor = new A.GoogleAuthProvider();
      provedor.setCustomParameters({ prompt: 'select_account' });
      try {
        await A.signInWithPopup(auth, provedor);
      } catch (e) {
        const c = e.code || '';
        if (c === 'auth/popup-blocked' || c === 'auth/operation-not-supported-in-this-environment') { await A.signInWithRedirect(auth, provedor); return { ok: true }; }
        if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') return { ok: false, cancelado: true };
        throw e;
      }
      return { ok: true };
    } catch (e) { return { ok: false, msg: erroAuth(e) }; }
  }
  const entrar = async () => { const r = await entrarGoogle(); if (!r.ok && r.msg) toast(r.msg, 7000); };

  async function entrarEmail(email, senha) {
    try {
      exigirDisponivel();
      await fb.A.signInWithEmailAndPassword(fb.auth, String(email).trim(), senha);
      return { ok: true };
    } catch (e) { return { ok: false, msg: erroAuth(e) }; }
  }

  async function cadastrarEmail(email, senha) {
    try {
      exigirDisponivel();
      if (String(senha).length < 8) throw { code: 'auth/weak-password' };
      const cred = await fb.A.createUserWithEmailAndPassword(fb.auth, String(email).trim(), senha);
      await fb.A.sendEmailVerification(cred.user, { url: location.origin + location.pathname });
      return { ok: true };
    } catch (e) { return { ok: false, msg: erroAuth(e) }; }
  }

  async function reenviarVerificacao() {
    try {
      await fb.A.sendEmailVerification(fb.auth.currentUser, { url: location.origin + location.pathname });
      return { ok: true };
    } catch (e) { return { ok: false, msg: erroAuth(e) }; }
  }

  // Depois de clicar no link do e-mail: recarrega a conta e renova o token (que passa a ter email_verified)
  async function confirmarVerificacao() {
    const u = fb.auth.currentUser;
    if (!u) return { ok: false, msg: 'Entre novamente.' };
    await u.reload();
    if (!u.emailVerified) return { ok: false, msg: 'Ainda não identificamos a confirmação. Abra o link enviado para o seu e-mail (veja também o spam).' };
    await u.getIdToken(true);
    atualizarUsuario(u);
    definirAcesso('verificando');
    await verificarAcesso();
    iniciarSync();
    return { ok: true };
  }

  // "Errei o e-mail": apaga a conta recém-criada (ainda sem acesso) para cadastrar de novo
  async function apagarContaNova() {
    const u = fb.auth.currentUser;
    if (!u || u.emailVerified) return desconectar();
    try { await u.delete(); } catch (e) { await fb.A.signOut(fb.auth); }
  }

  async function recuperarSenha(email) {
    try {
      exigirDisponivel();
      await fb.A.sendPasswordResetEmail(fb.auth, String(email).trim());
      return { ok: true };
    } catch (e) {
      // Não revela se o e-mail tem conta ou não
      if (e.code === 'auth/user-not-found') return { ok: true };
      return { ok: false, msg: erroAuth(e) };
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

  // Código validado na etapa 1 do cadastro, guardado até a conta ser criada/confirmada
  const CHAVE_PENDENTE = 'caminho-sucesso.convite-pendente';
  const lerCodigoPendente = () => { try { return localStorage.getItem(CHAVE_PENDENTE); } catch (e) { return null; } };
  function guardarCodigoPendente(c) { try { c ? localStorage.setItem(CHAVE_PENDENTE, c) : localStorage.removeItem(CHAVE_PENDENTE); } catch (e) { /* */ } }

  function definirAcesso(acesso, msg = null) {
    const antes = estado.acesso;
    estado.acesso = acesso; estado.msgAcesso = msg;
    if (acesso === 'liberado' && estado.usuario) gravarAcessoCache(estado.usuario.uid);
    if (acesso === 'sem-convite' || acesso === 'sem-login' || acesso === 'verificar-email') limparAcessoCache();
    if (antes !== acesso || msg) avisarApp();
  }

  const offline = e => !navigator.onLine || /unavailable|offline|network/i.test((e?.code || '') + (e?.message || ''));

  async function verificarAcesso() {
    if (!estado.usuario) return definirAcesso('sem-login');
    if (estado.admin) return definirAcesso('liberado');
    try {
      const snap = await fb.F.getDoc(fb.F.doc(fb.db, 'membros', estado.usuario.uid));
      if (snap.exists()) return definirAcesso('liberado');
    } catch (e) {
      const cache = lerAcessoCache();
      if (offline(e) && cache?.uid === estado.usuario.uid) return definirAcesso('liberado');
      if (offline(e)) return definirAcesso('offline', 'Sem conexão. Conecte-se à internet para confirmar seu acesso.');
      if (!(e.code || '').includes('permission-denied')) {
        console.error(e);
        return definirAcesso('erro', 'Não foi possível verificar seu acesso. Tente novamente.');
      }
    }
    // Ainda não é membro
    if (!estado.usuario.emailVerificado) return definirAcesso('verificar-email');
    const pendente = lerCodigoPendente();
    if (pendente) {
      const r = await resgatarConvite(pendente);
      if (r.ok) return;
      return definirAcesso('sem-convite', r.msg);
    }
    definirAcesso('sem-convite');
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
  // ana.souza@gmail.com → an***@gmail.com
  function mascararEmail(email) {
    const [local, dominio] = String(email).split('@');
    return `${local.slice(0, Math.min(2, Math.max(1, local.length - 1)))}***@${dominio}`;
  }
  // Confere se um e-mail digitado é compatível com a máscara do convite (aviso antes de cadastrar)
  function emailCombina(email, mascara) {
    const [pre, dominio] = String(mascara).split('***@');
    const e = String(email).trim().toLowerCase();
    return e.startsWith(pre) && e.endsWith('@' + dominio);
  }

  // Etapa 1 do cadastro: valida o código sem precisar de conta
  async function validarCodigo(entrada) {
    const codigo = normalizarCodigo(entrada);
    if (!codigo) return { ok: false, msg: 'Código em formato inválido. Ele se parece com CS-XXXX-XXXX-XXXX.' };
    if (!estado.disponivel) return { ok: false, msg: 'Sem conexão com a internet.' };
    try {
      const snap = await fb.F.getDoc(fb.F.doc(fb.db, 'validacao', codigo));
      if (!snap.exists()) return { ok: false, msg: 'Código de convite não encontrado. Confira se digitou corretamente.' };
      const v = snap.data();
      if (!v.ativo) return { ok: false, msg: 'Este convite já foi utilizado ou foi cancelado.' };
      if (v.expiraEm.toMillis() < Date.now()) return { ok: false, msg: 'Este convite expirou. Peça um novo ao administrador.' };
      guardarCodigoPendente(codigo);
      return { ok: true, codigo, emailMascarado: v.emailMascarado, expiraEm: v.expiraEm.toMillis() };
    } catch (e) {
      return { ok: false, msg: offline(e) ? 'Sem conexão com a internet.' : 'Não foi possível validar o código agora.' };
    }
  }

  async function resgatarConvite(entrada) {
    if (!estado.usuario) return { ok: false, msg: 'Entre na sua conta primeiro.' };
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
      // O código existe mas é de outro e-mail? Registra a tentativa para o administrador poder liberar.
      try {
        const v = await F.getDoc(F.doc(db, 'validacao', codigo));
        if (v.exists() && v.data().ativo) {
          await F.addDoc(F.collection(db, 'tentativas'), { codigo, email, uid: estado.usuario.uid, criadoEm: F.serverTimestamp() }).catch(() => {});
          return { ok: false, emailErrado: true, msg: `Este convite foi emitido para ${v.data().emailMascarado}, mas você entrou com ${email}. Entre com o e-mail do convite — ou aguarde: o administrador foi avisado e pode liberar o convite para ${email}. Depois é só tentar de novo com o mesmo código.` };
        }
      } catch (e2) { /* segue para a mensagem genérica */ }
      return { ok: false, msg: 'Código de convite não encontrado, já utilizado ou cancelado.' };
    }
    if (convite.revogado) return { ok: false, msg: 'Este convite foi cancelado pelo administrador.' };
    if (convite.usado) return { ok: false, msg: 'Este convite já foi utilizado.' };
    if (convite.expiraEm.toMillis() < Date.now()) return { ok: false, msg: 'Este convite expirou. Peça um novo ao administrador.' };
    try {
      const lote = F.writeBatch(db);
      lote.set(F.doc(db, 'membros', estado.usuario.uid), { email, codigo, criadoEm: F.serverTimestamp() });
      lote.update(refConvite, { usado: true, usadoPor: estado.usuario.uid, usadoEm: F.serverTimestamp() });
      lote.update(F.doc(db, 'validacao', codigo), { ativo: false });
      await lote.commit();
    } catch (e) {
      console.error(e);
      return { ok: false, msg: 'Não foi possível ativar o convite. Verifique se ele é válido para este e-mail.' };
    }
    guardarCodigoPendente(null);
    definirAcesso('liberado');
    iniciarSync();
    return { ok: true };
  }

  /* ---------- Painel do administrador ---------- */
  function exigirAdmin() { if (!estado.admin) throw new Error('Apenas o administrador pode fazer isso.'); }
  function validarEmail(email) {
    email = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('E-mail inválido.');
    return email;
  }

  async function gerarConvite(email, dias, nota) {
    exigirAdmin();
    email = validarEmail(email);
    const { F, db } = fb;
    const codigo = gerarCodigo();
    const expiraEm = F.Timestamp.fromMillis(Date.now() + dias * 86400000);
    const lote = F.writeBatch(db);
    lote.set(F.doc(db, 'convites', codigo), {
      email, nota: String(nota || '').slice(0, 200), criadoEm: F.serverTimestamp(), expiraEm, usado: false, revogado: false,
    });
    lote.set(F.doc(db, 'validacao', codigo), { emailMascarado: mascararEmail(email), expiraEm, ativo: true });
    await lote.commit();
    return { codigo, email, expiraEm: expiraEm.toMillis() };
  }

  // Corrige o e-mail de um convite pendente (e renova a validade se precisar) para reenviar ao convidado
  async function alterarEmailConvite(codigo, email, diasMin = 7) {
    exigirAdmin();
    email = validarEmail(email);
    const { F, db } = fb;
    const atual = await F.getDoc(F.doc(db, 'convites', codigo));
    if (!atual.exists()) throw new Error('Convite não encontrado.');
    const c = atual.data();
    if (c.usado || c.revogado) throw new Error('Só é possível alterar convites pendentes.');
    const expiraEm = F.Timestamp.fromMillis(Math.max(c.expiraEm.toMillis(), Date.now() + diasMin * 86400000));
    const lote = F.writeBatch(db);
    lote.update(F.doc(db, 'convites', codigo), { email, expiraEm });
    lote.set(F.doc(db, 'validacao', codigo), { emailMascarado: mascararEmail(email), expiraEm, ativo: true });
    await lote.commit();
    return { codigo, email, expiraEm: expiraEm.toMillis() };
  }

  async function listarConvites() {
    exigirAdmin();
    const { F, db } = fb;
    const [snap, snapVal] = await Promise.all([
      F.getDocs(F.query(F.collection(db, 'convites'), F.orderBy('criadoEm', 'desc'))),
      F.getDocs(F.collection(db, 'validacao')),
    ]);
    const comValidacao = new Set();
    snapVal.forEach(d => comValidacao.add(d.id));
    const out = [];
    const reparar = F.writeBatch(db);
    let nReparos = 0;
    snap.forEach(d => {
      const c = d.data();
      // convites criados antes da validação pública: cria o registro que falta
      if (!comValidacao.has(d.id) && !c.usado && !c.revogado && nReparos < 400) {
        reparar.set(F.doc(db, 'validacao', d.id), { emailMascarado: mascararEmail(c.email), expiraEm: c.expiraEm, ativo: true });
        nReparos++;
      }
      out.push({ codigo: d.id, ...c, criadoEm: c.criadoEm?.toMillis?.() || 0, expiraEm: c.expiraEm?.toMillis?.() || 0, usadoEm: c.usadoEm?.toMillis?.() || 0 });
    });
    if (nReparos) await reparar.commit();
    return out;
  }
  async function revogarConvite(codigo) {
    exigirAdmin();
    const { F, db } = fb;
    const lote = F.writeBatch(db);
    lote.update(F.doc(db, 'convites', codigo), { revogado: true });
    const v = await F.getDoc(F.doc(db, 'validacao', codigo));
    if (v.exists()) lote.update(F.doc(db, 'validacao', codigo), { ativo: false });
    await lote.commit();
  }
  async function excluirConvite(codigo) {
    exigirAdmin();
    const { F, db } = fb;
    const lote = F.writeBatch(db);
    lote.delete(F.doc(db, 'convites', codigo));
    lote.delete(F.doc(db, 'validacao', codigo));
    await lote.commit();
  }
  async function listarTentativas() {
    exigirAdmin();
    const snap = await fb.F.getDocs(fb.F.collection(fb.db, 'tentativas'));
    const out = [];
    snap.forEach(d => { const t = d.data(); out.push({ id: d.id, ...t, criadoEm: t.criadoEm?.toMillis?.() || 0 }); });
    return out.sort((a, b) => b.criadoEm - a.criadoEm);
  }
  async function descartarTentativa(id) { exigirAdmin(); await fb.F.deleteDoc(fb.F.doc(fb.db, 'tentativas', id)); }
  // Libera o convite para o e-mail que o convidado usou e limpa as tentativas daquele código
  async function liberarParaTentativa(t, todas) {
    const r = await alterarEmailConvite(t.codigo, t.email);
    await Promise.all(todas.filter(x => x.codigo === t.codigo).map(x => descartarTentativa(x.id)));
    return r;
  }
  async function listarMembros() {
    exigirAdmin();
    const snap = await fb.F.getDocs(fb.F.collection(fb.db, 'membros'));
    const out = [];
    snap.forEach(d => { const m = d.data(); out.push({ uid: d.id, ...m, criadoEm: m.criadoEm?.toMillis?.() || 0 }); });
    return out.sort((a, b) => b.criadoEm - a.criadoEm);
  }
  async function removerMembro(uid) { exigirAdmin(); await fb.F.deleteDoc(fb.F.doc(fb.db, 'membros', uid)); }

  function atualizarUsuario(u) {
    estado.usuario = u ? {
      uid: u.uid, nome: u.displayName, email: u.email, foto: u.photoURL, emailVerificado: u.emailVerified,
      provedor: u.providerData.some(p => p.providerId === 'google.com') ? 'google' : 'senha',
    } : null;
    estado.admin = !!u && u.emailVerified && (u.email || '').toLowerCase() === ADMIN_EMAIL;
  }

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
      atualizarUsuario(u);
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
    estado, entrar, entrarGoogle, entrarEmail, cadastrarEmail, reenviarVerificacao, confirmarVerificacao,
    apagarContaNova, recuperarSenha, sair, sincronizar, agendar, desconectar,
    verificarAcesso, validarCodigo, resgatarConvite, normalizarCodigo, emailCombina, guardarCodigoPendente, lerCodigoPendente,
    gerarConvite, alterarEmailConvite, listarConvites, revogarConvite, excluirConvite,
    listarTentativas, descartarTentativa, liberarParaTentativa, listarMembros, removerMembro,
  };
})();
window.Nuvem = Nuvem;

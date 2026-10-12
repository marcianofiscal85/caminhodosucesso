'use strict';
/* Interface do Caminho do Sucesso */

const CHAVE = 'caminho-sucesso.v1';
const $app = document.getElementById('app');
let st = carregar();
let rota = 'hoje';
const ui = { modal: null, editObj: null, editPad: null, editCrenca: null, abertos: new Set(), onb: null };

/* ===================== Persistência ===================== */
function estadoInicial() {
  return { versao: 1, perfil: null, objetivos: [], padroes: [], crencas: [], skills: {}, planos: {},
    diario: {}, extras: [], avisos: [], ultimaAbertura: null };
}
function carregar() {
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE));
    if (s && s.versao) return Object.assign(estadoInicial(), s);
  } catch (e) { /* armazenamento indisponível */ }
  return estadoInicial();
}
let falhaSalvarAvisada = false;
function salvar() {
  try { localStorage.setItem(CHAVE, JSON.stringify(st)); }
  catch (e) {
    if (!falhaSalvarAvisada) { toast('Não foi possível salvar neste navegador. Faça um backup em Ajustes.'); falhaSalvarAvisada = true; }
  }
  window.Nuvem?.agendar();
}

/* Ponte usada pela sincronização na nuvem (js/nuvem.js) */
window.App = {
  get estado() { return st; },
  substituir(novo) {
    st = Object.assign(estadoInicial(), novo);
    iniciarDia(); salvar(); renderSeguro();
  },
  aoMudarNuvem() { if (!st.perfil || rota === 'ajustes') renderSeguro(); },
};
// Não redesenha enquanto a pessoa está digitando ou com um formulário/modal aberto
function renderSeguro() {
  const digitando = document.activeElement?.matches('input:not([type=checkbox]):not([type=range]), textarea, select');
  if (ui.modal || ui.editObj || ui.editPad || ui.editCrenca || digitando) return;
  render();
}

/* ===================== Utilidades ===================== */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hoje = () => dataLocal();
const periodoDaHora = h => (h < '12:00' ? 'manha' : h < '18:00' ? 'tarde' : 'noite');
const minusc = s => s.charAt(0).toLowerCase() + s.slice(1);

function toast(msg, ms = 4200) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('visivel');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('visivel'), ms);
}
function dataExtenso(data) {
  const [a, m, d] = data.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
}
function niveisHtml(n) {
  return `<span class="niveis" title="Nível ${n + 1} de 5">${[0, 1, 2, 3, 4].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;
}
function entradaDiario(data) {
  if (!st.diario[data]) st.diario[data] = {};
  return st.diario[data];
}

/* ===================== Ciclo do dia ===================== */
function iniciarDia() {
  if (!st.perfil) return;
  const h = hoje();
  if (st.ultimaAbertura && st.ultimaAbertura !== h) st.avisos = [];
  fecharDiasAnteriores(st, h);
  gerarPlano(st, h);
  st.ultimaAbertura = h;
  salvar();
}

function incluirNoPlanoHoje(tipo, refId, tplId) {
  const plano = st.planos[hoje()];
  if (!plano || plano.tarefas.some(t => t.refId === refId && t.tplId === tplId)) return;
  plano.tarefas.push(montarTarefa(st, TPL[tplId], tipo, refId, usoAncoras(st, hoje()), { primaria: true }));
  ordenarTarefas(st, plano.tarefas);
}
function removerPendentesDe(refId) {
  const plano = st.planos[hoje()];
  if (plano) plano.tarefas = plano.tarefas.filter(t => !(t.refId === refId && t.status === 'pendente'));
}

/* ===================== Render ===================== */
const NAV = [
  ['hoje', '☀️', 'Hoje'], ['objetivos', '🎯', 'Objetivos'], ['padroes', '🔁', 'Padrões'],
  ['diario', '📓', 'Diário'], ['progresso', '📈', 'Progresso'],
];

function render() {
  if (!st.perfil) { $app.innerHTML = viewBoasVindas(); return; }
  const views = { hoje: viewHoje, objetivos: viewObjetivos, padroes: viewPadroes, diario: viewDiario, progresso: viewProgresso, ajustes: viewAjustes };
  $app.innerHTML = `
    <header class="topo">
      <div class="marca"><span class="logo">◆</span> Caminho do Sucesso</div>
      <button class="icone-btn ${rota === 'ajustes' ? 'ativo' : ''}" data-acao="ir" data-rota="ajustes" aria-label="Ajustes">⚙️</button>
    </header>
    <main class="conteudo">${views[rota]()}</main>
    <nav class="nav">${NAV.map(([r, i, n]) => `
      <button class="${rota === r ? 'ativo' : ''}" data-acao="ir" data-rota="${r}"><span>${i}</span>${n}</button>`).join('')}
    </nav>
    ${ui.modal ? viewModal() : ''}`;
}

/* ===================== Boas-vindas ===================== */
function viewBoasVindas() {
  if (!ui.onb) ui.onb = { nome: '', pico: 'manha', minutos: 30, ancoras: ANCORAS_PADRAO.map(a => ({ ...a })) };
  const o = ui.onb;
  return `
  <main class="conteudo boasvindas">
    <div class="hero">
      <div class="logo-grande">◆</div>
      <h1>Caminho do Sucesso</h1>
      <p>Seus objetivos, conquistados com pequenas mudanças diárias que se adaptam a você.</p>
    </div>
    ${window.Nuvem?.estado.disponivel && !window.Nuvem.estado.usuario ? `
    <div class="cartao destaque conta-rapida">
      <p>Já usa o app em outro aparelho?</p>
      <button class="btn primario" data-acao="nuvem-entrar">Entrar com Google e restaurar</button>
    </div>` : ''}
    ${window.Nuvem?.estado.usuario ? `<div class="aviso sucesso"><span>Conectado como ${esc(window.Nuvem.estado.usuario.email)}. Complete o cadastro abaixo — ele será salvo na nuvem.</span></div>` : ''}
    <div class="cartao">
      <h2>Como funciona</h2>
      <ul class="lista-metodo">
        <li><b>Micro-ações diárias</b> ligadas a momentos que já existem na sua rotina — sem conflitar com o que você já faz.</li>
        <li><b>Não conseguiu?</b> Você diz o motivo e o app adapta: diminui, muda o horário ou troca a estratégia.</li>
        <li><b>Conseguiu 3 vezes seguidas?</b> A tarefa sobe de nível, no ritmo do seu cérebro.</li>
        <li><b>Padrões, pensamentos e estado emocional</b> são trabalhados junto, com técnicas de neurociência, PNL e ciência do comportamento.</li>
      </ul>
    </div>
    <div class="cartao">
      <h2>Vamos conhecer sua rotina</h2>
      <label class="campo">Como você quer ser chamado?
        <input data-onb="nome" value="${esc(o.nome)}" placeholder="Seu nome" autocomplete="given-name"></label>
      <div class="campo">Quando você tem mais energia?
        <div class="chips">${Object.entries(PERIODOS).map(([k, n]) => `
          <button class="chip ${o.pico === k ? 'on' : ''}" data-acao="onb-pico" data-v="${k}">${n}</button>`).join('')}</div>
      </div>
      <label class="campo">Quanto tempo por dia você pode dedicar (no total)?
        <select data-onb="minutos">${[10, 15, 20, 30, 45, 60, 90].map(m => `<option value="${m}" ${o.minutos == m ? 'selected' : ''}>${m} minutos</option>`).join('')}</select>
        <small>Comece com menos do que acha que consegue. O app aumenta conforme você evolui.</small></label>
      <div class="campo">Momentos fixos da sua rotina (ajuste os horários):
        <small>As tarefas serão encaixadas logo depois desses momentos — é a técnica de "empilhamento de hábitos".</small>
        ${o.ancoras.map((a, i) => `
          <div class="linha-ancora">
            <input data-onb-ancora="${i}" data-campo="texto" value="${esc(a.texto)}">
            <input type="time" data-onb-ancora="${i}" data-campo="hora" value="${a.hora}">
          </div>`).join('')}
      </div>
      <button class="btn primario largo" data-acao="onb-comecar">Começar minha jornada →</button>
    </div>
  </main>`;
}

/* ===================== HOJE ===================== */
function viewHoje() {
  const h = hoje();
  const plano = st.planos[h] || gerarPlano(st, h);
  const hr = new Date().getHours();
  const saud = hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite';
  const ts = plano.tarefas;
  const visiveis = ts.filter(t => !(t.status === 'falhou' && ts.some(x => x.adaptadaDe === t.id)));
  const feitas = visiveis.filter(t => t.status === 'feita').length;
  const pct = visiveis.length ? feitas / visiveis.length : 0;
  const minRest = visiveis.filter(t => t.status === 'pendente').reduce((s, t) => s + t.minutos, 0);
  const seq = sequenciaDias(st, h);
  const ent = st.diario[h] || {};
  const C = 2 * Math.PI * 30;

  const avisos = [...new Map(st.avisos.map(a => [a.texto, a])).values()];
  let html = `
    <section class="saudacao">
      <div>
        <p class="data">${dataExtenso(h)}</p>
        <h1>${saud}, ${esc(st.perfil.nome)}</h1>
        <p class="sub">${seq > 0 ? `🔥 ${seq} dia${seq > 1 ? 's' : ''} seguido${seq > 1 ? 's' : ''} em movimento` : 'Hoje é um ótimo dia para começar.'}</p>
      </div>
      <svg class="anel" viewBox="0 0 72 72" aria-label="${feitas} de ${visiveis.length} tarefas">
        <circle cx="36" cy="36" r="30" class="anel-fundo"/>
        <circle cx="36" cy="36" r="30" class="anel-valor" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/>
        <text x="36" y="41" text-anchor="middle">${feitas}/${visiveis.length}</text>
      </svg>
    </section>`;

  avisos.forEach(a => {
    html += `<div class="aviso ${a.tipo}"><span>${esc(a.texto)}</span><button class="fechar" data-acao="fechar-aviso" data-texto="${esc(a.texto)}" aria-label="Fechar">×</button></div>`;
  });

  if (!st.objetivos.some(o => o.ativo)) {
    html += `<div class="cartao destaque">
      <h2>Comece pelo seu objetivo</h2>
      <p>Cadastre o que você quer conquistar. O app cria micro-ações diárias específicas para ele.</p>
      <button class="btn primario" data-acao="novo-objetivo">+ Adicionar objetivo</button></div>`;
  }

  if (!ent.humor) {
    html += `<div class="cartao checkin-rapido">
      <h3>Como você está agora?</h3>
      <div class="emojis">${['😣', '😕', '😐', '🙂', '😄'].map((e, i) => `<button data-acao="humor-rapido" data-v="${i + 1}" aria-label="Humor ${i + 1}">${e}</button>`).join('')}</div>
    </div>`;
  } else if (ent.humor <= 2 && plano.modo !== 'leve' && visiveis.some(t => t.status === 'pendente' && t.nivel > 0)) {
    html += `<div class="cartao leve">
      <h3>Dia pesado?</h3>
      <p>Tudo bem. Em dias assim, manter a corrente com versões menores vale mais do que forçar. Quer que eu deixe as tarefas de hoje mais leves?</p>
      <button class="btn" data-acao="modo-leve">Ativar modo leve</button></div>`;
  }

  if (st.crencas.length) {
    const c = st.crencas[diaNum(h) % st.crencas.length];
    if (c.reenquadre) html += `<div class="crenca-dia"><small>Hoje eu escolho acreditar</small><p>"${esc(c.reenquadre)}"</p></div>`;
  }

  if (visiveis.length) {
    html += `<div class="resumo-dia">${minRest ? `⏱️ ${minRest} min restantes` : '🏆 Plano de hoje concluído!'}${plano.modo === 'leve' ? ' · modo leve' : ''}</div>`;
  }

  for (const [per, nome] of Object.entries(PERIODOS)) {
    const grupo = visiveis.filter(t => (ancoraPorId(st, t.ancoraId)?.periodo || 'tarde') === per);
    if (!grupo.length) continue;
    html += `<h2 class="periodo">${nome}</h2>` + grupo.map(cardTarefa).join('');
  }

  if (hr >= 18) {
    const feita = ent.funcionou || ent.g1;
    html += `<div class="cartao revisao">
      <h3>${feita ? '✓ Revisão da noite feita' : '🌙 Revisão da noite (2 min)'}</h3>
      <p>Gratidão, o que funcionou e como ser 1% melhor amanhã. Isso fecha o ciclo de aprendizado do dia.</p>
      <button class="btn" data-acao="ir" data-rota="diario">${feita ? 'Ver diário' : 'Fazer agora'}</button></div>`;
  }
  return html;
}

function origemTarefa(t) {
  if (t.tipo === 'estado') return '✨ Estado do dia';
  if (t.tipo === 'padrao') {
    const p = st.padroes.find(x => x.id === t.refId);
    return `🔁 ${esc(p ? p.nome : 'Padrão')}`;
  }
  const o = st.objetivos.find(x => x.id === t.refId);
  return o ? `${AREAS[o.area].icone} ${esc(o.titulo)}` : '🎯 Objetivo';
}

function cardTarefa(t) {
  const a = ancoraPorId(st, t.ancoraId);
  const tpl = TPL[t.tplId];
  const pil = PILARES[tpl.pilar];
  const aberto = ui.abertos.has(t.id);
  const quando = a ? `Depois de ${esc(a.texto)} · ${a.hora}` : 'No melhor momento para você';
  let acoes;
  if (t.status === 'pendente') {
    acoes = `<button class="btn primario" data-acao="concluir" data-id="${t.id}">✓ Feito</button>
             <button class="btn" data-acao="falhar" data-id="${t.id}">Não consegui</button>`;
  } else if (t.status === 'feita') {
    acoes = `<span class="status-ok">✓ Concluída</span><button class="link" data-acao="desfazer" data-id="${t.id}">desfazer</button>`;
  } else {
    acoes = `<span class="status-aj">↻ Ajustada${t.motivo ? ` — ${esc(MOTIVOS[t.motivo].nome.toLowerCase())}` : ''}</span><button class="link" data-acao="desfazer" data-id="${t.id}">desfazer</button>`;
  }
  return `
  <article class="tarefa ${t.status}" style="--pilar:${pil.cor}">
    <div class="tarefa-topo"><span class="ancora">${quando}</span><span class="min">${t.minutos} min</span></div>
    <div class="origem">${origemTarefa(t)}</div>
    <h3>${esc(t.titulo)}</h3>
    <div class="meta-linha">
      <span class="pilar">${pil.nome}</span>${niveisHtml(t.nivel)}
      ${t.adaptadaDe ? '<span class="tag">versão adaptada</span>' : ''}
      <button class="link" data-acao="detalhes" data-id="${t.id}">${aberto ? 'fechar' : 'por que funciona?'}</button>
    </div>
    ${aberto ? `<div class="detalhes">
      ${a ? `<p><b>Sua intenção de implementação:</b> "Depois de ${esc(a.texto)}, eu vou ${esc(minusc(t.titulo))}"</p>` : ''}
      <p><b>A ciência por trás:</b> ${esc(tpl.porque)}</p>
      <p><b>Ao terminar:</b> celebre na hora — um sorriso, um "isso!". A emoção positiva logo após a ação é o que grava o hábito (B.J. Fogg).</p>
    </div>` : ''}
    <div class="acoes">${acoes}</div>
  </article>`;
}

/* ===================== MODAIS ===================== */
function viewModal() {
  const m = ui.modal;
  let corpo = '';
  if (m.tipo === 'falha' && m.etapa === 'motivo') {
    corpo = `<h2>Tudo bem. O que aconteceu?</h2>
      <p class="sub">Não existe fracasso, só informação. Sua resposta me ajuda a ajustar a tarefa para sua realidade.</p>
      <div class="motivos">${Object.entries(MOTIVOS).map(([k, v]) => `
        <button class="motivo" data-acao="motivo" data-motivo="${k}"><span>${v.icone}</span>${v.nome}</button>`).join('')}</div>
      <button class="link" data-acao="fechar-modal">cancelar</button>`;
  } else if (m.tipo === 'falha') {
    corpo = `<h2>Tarefa adaptada ↻</h2>
      <p>${esc(m.texto)}</p>
      <div class="acoes-modal">
        <button class="btn primario" data-acao="versao-facil">Tentar uma versão menor agora</button>
        <button class="btn" data-acao="fechar-modal">Ok, sigo amanhã</button>
      </div>`;
  } else if (m.tipo === 'msg') {
    corpo = `<div class="modal-icone">${m.icone || '✨'}</div><h2>${esc(m.titulo)}</h2><p>${esc(m.texto)}</p>
      <button class="btn primario largo" data-acao="fechar-modal">Continuar</button>`;
  } else if (m.tipo === 'impulso') {
    const p = st.padroes.find(x => x.id === m.padId);
    corpo = `<h2>Impulso: ${esc(p.nome)}</h2>
      <p class="sub">Observar sem julgamento já enfraquece o piloto automático.</p>
      <div class="campo">O que aconteceu?
        <div class="chips">
          <button class="chip ${m.resistiu === true ? 'on' : ''}" data-acao="imp-res" data-v="1">💪 Resisti</button>
          <button class="chip ${m.resistiu === false ? 'on' : ''}" data-acao="imp-res" data-v="0">Cedi desta vez</button>
        </div></div>
      <div class="campo">O que você estava sentindo?
        <div class="chips">${SENTIMENTOS.map(s => `<button class="chip ${m.sentimentos.includes(s) ? 'on' : ''}" data-acao="imp-sent" data-v="${s}">${s}</button>`).join('')}</div></div>
      <label class="campo">Contexto (onde, com quem, o que disparou)
        <input data-modal="contexto" value="${esc(m.contexto)}" placeholder="Ex.: sozinho no sofá depois do jantar"></label>
      <div class="acoes-modal">
        <button class="btn primario" data-acao="imp-salvar" ${m.resistiu === null ? 'disabled' : ''}>Registrar</button>
        <button class="btn" data-acao="fechar-modal">Cancelar</button>
      </div>`;
  }
  return `<div class="modal-fundo" data-acao="fundo-modal"><div class="modal" role="dialog">${corpo}</div></div>`;
}

/* ===================== OBJETIVOS ===================== */
const IDENTIDADE_EXEMPLO = {
  saude: 'cuida do corpo e se movimenta todos os dias',
  financas: 'cuida bem do próprio dinheiro',
  carreira: 'entrega com excelência e cresce todos os dias',
  aprendizado: 'aprende algo novo todos os dias',
  relacionamentos: 'cultiva relações com presença e carinho',
  bemestar: 'cuida da mente e vive com propósito',
  outro: 'age todos os dias em direção aos próprios objetivos',
};
function opcoesPrimario(area, sel) {
  return TEMPLATES.filter(t => t.tipo === 'meta' && (t.areas.includes(area) || t.areas.includes('*')))
    .sort((a, b) => (b.areas.includes(area) ? 1 : 0) - (a.areas.includes(area) ? 1 : 0))
    .map(t => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${t.nome} — ex.: ${esc(preencher(t.niveis[0].t, { meta: 'seu objetivo' }).slice(0, 70))}…</option>`).join('');
}

function viewObjetivos() {
  if (ui.editObj) return formObjetivo();
  const h = hoje();
  const lista = [...st.objetivos].sort((a, b) => b.ativo - a.ativo);
  let html = `<div class="cab-secao"><h1>Objetivos</h1><button class="btn primario" data-acao="novo-objetivo">+ Novo</button></div>
    <p class="sub">Até 3 objetivos aparecem por dia. Se tiver mais, eles se revezam — foco é poder.</p>`;
  if (!lista.length) html += `<div class="vazio">🎯<p>Nenhum objetivo ainda. O que você quer conquistar?</p></div>`;
  lista.forEach(o => {
    const sk = st.skills[chaveDe('meta', o.id, o.primario)] || { nivel: 0 };
    const ts = tarefasEntre(st, somarDias(h, -7), somarDias(h, 1)).filter(t => t.refId === o.id && t.status !== 'pendente');
    const taxa = ts.length ? Math.round(ts.filter(t => t.status === 'feita').length / ts.length * 100) : null;
    const total = Object.values(st.planos).reduce((s, p) => s + p.tarefas.filter(t => t.refId === o.id && t.status === 'feita').length, 0);
    let prazo = '';
    if (o.prazo) {
      const dias = diaNum(o.prazo) - diaNum(h);
      prazo = dias >= 0 ? `⏳ ${dias} dias restantes` : '⏳ prazo vencido — que tal revisar?';
    }
    html += `<article class="cartao objetivo ${o.ativo ? '' : 'arquivado'}">
      <div class="obj-topo"><span class="obj-icone">${AREAS[o.area].icone}</span>
        <div><h3>${esc(o.titulo)}</h3><small>${AREAS[o.area].nome}${prazo ? ' · ' + prazo : ''}</small></div></div>
      ${o.porque ? `<p class="porque">"${esc(o.porque)}"</p>` : ''}
      ${o.identidade ? `<p class="identidade">Eu sou uma pessoa que ${esc(o.identidade)}.</p>` : ''}
      <div class="obj-stats">
        <div><b>${TPL[o.primario].nome}</b><small>hábito principal</small>${niveisHtml(sk.nivel)}</div>
        <div><b>${taxa === null ? '—' : taxa + '%'}</b><small>execução 7 dias</small></div>
        <div><b>${total}</b><small>ações feitas</small></div>
      </div>
      <div class="acoes">
        <button class="btn" data-acao="editar-objetivo" data-id="${o.id}">Editar</button>
        <button class="btn" data-acao="arquivar-objetivo" data-id="${o.id}">${o.ativo ? 'Pausar' : 'Reativar'}</button>
        <button class="link perigo" data-acao="excluir-objetivo" data-id="${o.id}">excluir</button>
      </div>
    </article>`;
  });
  return html;
}

function formObjetivo() {
  const o = ui.editObj === 'novo' ? { titulo: '', area: 'saude', porque: '', identidade: '', prazo: '', primario: AREAS.saude.primario } : st.objetivos.find(x => x.id === ui.editObj);
  return `<div class="cab-secao"><h1>${ui.editObj === 'novo' ? 'Novo objetivo' : 'Editar objetivo'}</h1></div>
  <form class="cartao" id="form-objetivo">
    <label class="campo">O que você quer conquistar?
      <input name="titulo" required value="${esc(o.titulo)}" placeholder="Ex.: Perder 8 kg até março">
      <small>Seja específico e mensurável: o que, quanto e até quando.</small></label>
    <label class="campo">Área da vida
      <select name="area" id="sel-area">${Object.entries(AREAS).map(([k, a]) => `<option value="${k}" ${o.area === k ? 'selected' : ''}>${a.icone} ${a.nome}</option>`).join('')}</select></label>
    <label class="campo">Por que isso é importante para você?
      <textarea name="porque" rows="3" placeholder="Como você vai se sentir quando conseguir? O que muda na sua vida?">${esc(o.porque)}</textarea>
      <small>Um porquê emocional ativa o sistema de recompensa e sustenta a motivação nos dias difíceis.</small></label>
    <label class="campo">Quem você precisa se tornar? <span class="prefixo">Eu sou uma pessoa que…</span>
      <input name="identidade" id="inp-identidade" value="${esc(o.identidade)}" placeholder="${IDENTIDADE_EXEMPLO[o.area]}"></label>
    <label class="campo">Prazo (opcional)
      <input type="date" name="prazo" value="${o.prazo || ''}"></label>
    <label class="campo">Hábito principal (a ação diária-chave)
      <select name="primario" id="sel-primario">${opcoesPrimario(o.area, o.primario)}</select>
      <small>Começa no nível mais fácil e evolui sozinho. Se não encaixar, o app troca por outro.</small></label>
    <div class="acoes">
      <button class="btn primario" type="submit">Salvar objetivo</button>
      <button class="btn" type="button" data-acao="cancelar-edicao">Cancelar</button>
    </div>
  </form>`;
}

function salvarObjetivo(form) {
  const f = Object.fromEntries(new FormData(form));
  f.titulo = f.titulo.trim();
  if (!f.titulo) return toast('Escreva seu objetivo.');
  if (ui.editObj === 'novo') {
    const o = { id: uid(), ...f, ativo: true, criadoEm: new Date().toISOString() };
    st.objetivos.push(o);
    incluirNoPlanoHoje('meta', o.id, o.primario);
    toast('Objetivo criado! Sua primeira micro-ação já está no plano de hoje.');
  } else {
    const o = st.objetivos.find(x => x.id === ui.editObj);
    const trocou = o.primario !== f.primario;
    Object.assign(o, f);
    const plano = st.planos[hoje()];
    if (plano) {
      if (trocou && o.ativo) {
        plano.tarefas = plano.tarefas.filter(t => !(t.refId === o.id && t.primaria && t.status === 'pendente'));
        incluirNoPlanoHoje('meta', o.id, o.primario);
      }
      plano.tarefas.filter(t => t.refId === o.id && t.status === 'pendente').forEach(t => atualizarTexto(st, t));
    }
    toast('Objetivo atualizado.');
  }
  ui.editObj = null; salvar(); render();
}

/* ===================== PADRÕES ===================== */
function viewPadroes() {
  if (ui.editPad) return formPadrao();
  if (ui.editCrenca) return formCrenca();
  const h = hoje();
  let html = `<div class="cab-secao"><h1>Padrões</h1></div>
    <div class="cartao explicacao">
      <h3>O loop do hábito</h3>
      <div class="loop"><span>Gatilho</span>→<span>Rotina</span>→<span>Recompensa</span></div>
      <p>Hábitos não se apagam — se reprogramam. Mantemos o gatilho, trocamos a rotina e buscamos uma recompensa parecida. Registre cada impulso: observar já enfraquece o piloto automático.</p>
    </div>
    <div class="cab-secao"><h2>Vícios e hábitos a transformar</h2><button class="btn" data-acao="novo-padrao">+ Adicionar</button></div>`;
  const pads = st.padroes;
  if (!pads.length) html += `<div class="vazio pequeno"><p>Algo que você faz no automático e quer reduzir? Redes sociais, doces, procrastinar, cigarro, reclamar…</p></div>`;
  pads.forEach(p => {
    const regHoje = p.registros.filter(r => r.data === h);
    const cedidas = p.registros.filter(r => !r.resistiu);
    const ultima = cedidas.length ? cedidas[cedidas.length - 1].data : (p.criadoEm || '').slice(0, 10);
    const diasLivre = ultima ? diaNum(h) - diaNum(ultima) : 0;
    const resistiu = p.registros.filter(r => r.resistiu).length;
    html += `<article class="cartao padrao ${p.ativo ? '' : 'arquivado'}">
      <h3>${esc(p.nome)}</h3>
      <div class="loop-mini">
        <div><small>Gatilho</small>${esc(p.gatilho || '—')}</div>
        <div><small>Sentimento</small>${esc(p.sentimento || '—')}</div>
        <div><small>Recompensa buscada</small>${esc(p.recompensa || '—')}</div>
        <div><small>Nova rotina</small>${esc(p.substituto || '—')}</div>
      </div>
      <div class="obj-stats">
        <div><b>${diasLivre}</b><small>dias desde a última vez que cedeu</small></div>
        <div><b>${resistiu}</b><small>impulsos vencidos</small></div>
        <div><b>${regHoje.length}</b><small>registros hoje</small></div>
      </div>
      <div class="acoes">
        <button class="btn primario" data-acao="impulso" data-id="${p.id}">Senti o impulso</button>
        <button class="btn" data-acao="editar-padrao" data-id="${p.id}">Editar</button>
        <button class="link" data-acao="arquivar-padrao" data-id="${p.id}">${p.ativo ? 'pausar' : 'reativar'}</button>
        <button class="link perigo" data-acao="excluir-padrao" data-id="${p.id}">excluir</button>
      </div>
    </article>`;
  });

  html += `<div class="cab-secao"><h2>Crenças limitantes</h2><button class="btn" data-acao="nova-crenca">+ Adicionar</button></div>
    <p class="sub">Pensamentos repetidos viram crenças, crenças moldam sentimentos e sentimentos guiam ações. Reescreva as crenças que te limitam.</p>`;
  if (!st.crencas.length) html += `<div class="vazio pequeno"><p>Ex.: "Eu nunca consigo manter nada", "Dinheiro é difícil", "Não sou bom nisso".</p></div>`;
  st.crencas.forEach(c => {
    html += `<article class="cartao crenca">
      <p class="velha">${esc(c.crenca)}</p>
      <p class="nova">→ ${esc(c.reenquadre || 'ainda sem nova versão')}</p>
      <div class="acoes"><button class="link" data-acao="editar-crenca" data-id="${c.id}">editar</button>
      <button class="link perigo" data-acao="excluir-crenca" data-id="${c.id}">excluir</button></div>
    </article>`;
  });
  return html;
}

const SUBSTITUTOS = ['beber um copo de água', 'caminhar 2 minutos', 'respirar 4-6 por 1 minuto', 'mandar mensagem para alguém',
  'alongar o corpo', 'anotar o que estou sentindo', 'ouvir uma música', 'comer uma fruta', 'ler uma página'];

function formPadrao() {
  const p = ui.editPad === 'novo' ? { nome: '', gatilho: '', sentimento: '', recompensa: '', substituto: '' } : st.padroes.find(x => x.id === ui.editPad);
  return `<div class="cab-secao"><h1>${ui.editPad === 'novo' ? 'Novo padrão' : 'Editar padrão'}</h1></div>
  <form class="cartao" id="form-padrao">
    <label class="campo">O que você quer reduzir ou parar?
      <input name="nome" required value="${esc(p.nome)}" placeholder="Ex.: rolar redes sociais à noite"></label>
    <label class="campo">Gatilho — quando costuma acontecer?
      <input name="gatilho" value="${esc(p.gatilho)}" placeholder="Ex.: deitar na cama com o celular">
      <small>Hora, lugar, pessoa, emoção ou ação anterior.</small></label>
    <label class="campo">O que você sente antes?
      <input name="sentimento" value="${esc(p.sentimento)}" placeholder="Ex.: cansaço, tédio, ansiedade"></label>
    <label class="campo">Que recompensa você realmente busca?
      <input name="recompensa" value="${esc(p.recompensa)}" placeholder="Ex.: desligar a mente, alívio, distração"></label>
    <label class="campo">Nova rotina — o que pode te dar uma recompensa parecida?
      <input name="substituto" id="inp-substituto" value="${esc(p.substituto)}" placeholder="Ex.: ler 2 páginas de um livro leve">
      <div class="chips">${SUBSTITUTOS.map(s => `<button type="button" class="chip" data-acao="sugerir-substituto" data-v="${s}">${s}</button>`).join('')}</div></label>
    <div class="acoes">
      <button class="btn primario" type="submit">Salvar</button>
      <button class="btn" type="button" data-acao="cancelar-edicao">Cancelar</button>
    </div>
  </form>`;
}

function salvarPadrao(form) {
  const f = Object.fromEntries(new FormData(form));
  f.nome = f.nome.trim();
  if (!f.nome) return toast('Descreva o padrão.');
  if (ui.editPad === 'novo') {
    const p = { id: uid(), ...f, ativo: true, registros: [], criadoEm: new Date().toISOString() };
    st.padroes.push(p);
    incluirNoPlanoHoje('padrao', p.id, 'nomear');
    toast('Padrão registrado. Começamos pela consciência: observar o impulso.');
  } else {
    Object.assign(st.padroes.find(x => x.id === ui.editPad), f);
    const plano = st.planos[hoje()];
    if (plano) plano.tarefas.filter(t => t.refId === ui.editPad && t.status === 'pendente').forEach(t => atualizarTexto(st, t));
  }
  ui.editPad = null; salvar(); render();
}

function formCrenca() {
  const c = ui.editCrenca === 'novo' ? { crenca: '', reenquadre: '' } : st.crencas.find(x => x.id === ui.editCrenca);
  return `<div class="cab-secao"><h1>Reescrever crença</h1></div>
  <form class="cartao" id="form-crenca">
    <label class="campo">Crença ou pensamento limitante
      <textarea name="crenca" rows="2" required placeholder="Ex.: Eu nunca consigo manter uma rotina">${esc(c.crenca)}</textarea></label>
    <div class="perguntas"><b>Questione:</b><ul>${PERGUNTAS_REENQUADRE.map(q => `<li>${q}</li>`).join('')}</ul></div>
    <label class="campo">Nova crença — realista, útil e no presente
      <textarea name="reenquadre" rows="2" placeholder="Ex.: Estou aprendendo a ser constante, um pequeno passo por dia">${esc(c.reenquadre)}</textarea>
      <small>Evite frases que seu cérebro rejeita ("sou perfeito"). Prefira "estou aprendendo a…", "cada dia mais…".</small></label>
    <div class="acoes">
      <button class="btn primario" type="submit">Salvar</button>
      <button class="btn" type="button" data-acao="cancelar-edicao">Cancelar</button>
    </div>
  </form>`;
}

function salvarCrenca(form) {
  const f = Object.fromEntries(new FormData(form));
  if (!f.crenca.trim()) return toast('Escreva a crença.');
  if (ui.editCrenca === 'novo') st.crencas.push({ id: uid(), ...f, criadoEm: new Date().toISOString() });
  else Object.assign(st.crencas.find(x => x.id === ui.editCrenca), f);
  ui.editCrenca = null; salvar(); render();
}

/* ===================== DIÁRIO ===================== */
function viewDiario() {
  const h = hoje();
  const e = st.diario[h] || {};
  const energia = e.energia || 5;
  let html = `<div class="cab-secao"><h1>Diário</h1></div>
  <p class="sub">${dataExtenso(h)} · salva automaticamente</p>
  <section class="cartao">
    <h2>☀️ Estado</h2>
    <div class="campo">Humor
      <div class="emojis">${['😣', '😕', '😐', '🙂', '😄'].map((em, i) => `<button class="${e.humor === i + 1 ? 'on' : ''}" data-acao="diario-humor" data-v="${i + 1}">${em}</button>`).join('')}</div></div>
    <label class="campo">Energia / vibração: <b id="val-energia">${energia}</b>/10
      <input type="range" min="1" max="10" value="${energia}" data-campo="energia">
      <small>Para elevar: respiração 4-6, movimento, luz natural, gratidão, uma música que te anima.</small></label>
    <div class="campo">Sentimentos presentes
      <div class="chips">${SENTIMENTOS.map(s => `<button class="chip ${(e.sentimentos || []).includes(s) ? 'on' : ''}" data-acao="diario-sent" data-v="${s}">${s}</button>`).join('')}</div></div>
    <label class="campo">Pensamento que mais está presente hoje
      <textarea rows="2" data-campo="pensamento" placeholder="O que sua mente está repetindo?">${esc(e.pensamento)}</textarea></label>
    <div class="campo">Esse pensamento…
      <div class="chips">
        <button class="chip ${e.tipoPensamento === 'ajuda' ? 'on' : ''}" data-acao="diario-tipo" data-v="ajuda">me fortalece</button>
        <button class="chip ${e.tipoPensamento === 'limita' ? 'on' : ''}" data-acao="diario-tipo" data-v="limita">me limita</button>
      </div></div>`;
  if (e.tipoPensamento === 'limita') {
    html += `<div class="perguntas"><b>Vamos questioná-lo:</b><ul>${PERGUNTAS_REENQUADRE.map(q => `<li>${q}</li>`).join('')}</ul></div>
    <label class="campo">Versão mais útil e realista
      <textarea rows="2" data-campo="reenquadre" placeholder="Reescreva o pensamento…">${esc(e.reenquadre)}</textarea></label>
    <button class="btn" data-acao="guardar-crenca">Guardar como crença transformada</button>`;
  }
  html += `</section>
  <section class="cartao">
    <h2>🌙 Revisão da noite</h2>
    <div class="campo">3 gratidões específicas de hoje
      ${[1, 2, 3].map(i => `<input data-campo="g${i}" value="${esc(e['g' + i])}" placeholder="${i}.">`).join('')}</div>
    <label class="campo">O que funcionou hoje?
      <textarea rows="2" data-campo="funcionou">${esc(e.funcionou)}</textarea></label>
    <label class="campo">Como posso ser 1% melhor amanhã?
      <textarea rows="2" data-campo="melhoria">${esc(e.melhoria)}</textarea></label>
  </section>`;

  const passados = Object.entries(st.diario).filter(([d]) => d < h).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14);
  if (passados.length) {
    html += `<h2 class="periodo">Dias anteriores</h2>`;
    passados.forEach(([d, x]) => {
      const p = st.planos[d];
      const r = p ? p.tarefas.filter(t => t.status !== 'pendente') : [];
      const taxa = r.length ? Math.round(r.filter(t => t.status === 'feita').length / r.length * 100) : null;
      html += `<details class="cartao dia-passado"><summary>
        <span>${dataExtenso(d)}</span>
        <span>${x.humor ? ['😣', '😕', '😐', '🙂', '😄'][x.humor - 1] : ''} ${x.energia ? `⚡${x.energia}` : ''} ${taxa !== null ? `· ${taxa}%` : ''}</span></summary>
        ${x.sentimentos?.length ? `<p><b>Sentimentos:</b> ${esc(x.sentimentos.join(', '))}</p>` : ''}
        ${x.pensamento ? `<p><b>Pensamento:</b> ${esc(x.pensamento)}</p>` : ''}
        ${x.reenquadre ? `<p><b>Reenquadre:</b> ${esc(x.reenquadre)}</p>` : ''}
        ${[x.g1, x.g2, x.g3].filter(Boolean).length ? `<p><b>Gratidão:</b> ${esc([x.g1, x.g2, x.g3].filter(Boolean).join(' · '))}</p>` : ''}
        ${x.funcionou ? `<p><b>Funcionou:</b> ${esc(x.funcionou)}</p>` : ''}
        ${x.melhoria ? `<p><b>1% melhor:</b> ${esc(x.melhoria)}</p>` : ''}
      </details>`;
    });
  }
  return html;
}

/* ===================== PROGRESSO ===================== */
function viewProgresso() {
  const h = hoje();
  const seq = sequenciaDias(st, h);
  const t7 = taxaSucesso(st, 7, somarDias(h, 1));
  const t30 = taxaSucesso(st, 30, somarDias(h, 1));
  const totalFeitas = Object.values(st.planos).reduce((s, p) => s + p.tarefas.filter(t => t.status === 'feita').length, 0);
  const pct = x => (x.total ? Math.round(x.taxa * 100) + '%' : '—');

  let html = `<div class="cab-secao"><h1>Progresso</h1></div>
  <div class="tiles">
    <div class="tile"><b>${seq}</b><small>dias seguidos</small></div>
    <div class="tile"><b>${pct(t7)}</b><small>execução 7 dias</small></div>
    <div class="tile"><b>${pct(t30)}</b><small>execução 30 dias</small></div>
    <div class="tile"><b>${totalFeitas}</b><small>micro-ações feitas</small></div>
  </div>
  <section class="cartao"><h2>Últimos 14 dias</h2>${grafico14(h)}
    <div class="legenda"><span><i class="leg-barra"></i>execução do plano</span><span><i class="leg-linha"></i>energia/vibração</span></div></section>
  <section class="cartao"><h2>O que seus dados mostram</h2>
    ${insights(st, h).map(i => `<div class="insight"><span>${i.icone}</span><p>${esc(i.texto)}</p></div>`).join('')}</section>`;

  const habs = Object.entries(st.skills).filter(([, s]) => s.feitos > 0)
    .map(([k, s]) => {
      const [ref, tplId] = k.split('|');
      const dono = ref === 'estado' ? 'Estado' : (st.objetivos.find(o => o.id === ref)?.titulo || st.padroes.find(p => p.id === ref)?.nome);
      return dono && TPL[tplId] ? { nome: TPL[tplId].nome, dono, s } : null;
    }).filter(Boolean).sort((a, b) => b.s.nivel - a.s.nivel || b.s.feitos - a.s.feitos);
  if (habs.length) {
    html += `<section class="cartao"><h2>Hábitos em construção</h2>
      ${habs.map(x => `<div class="hab"><div><b>${x.nome}</b><small>${esc(x.dono)} · ${x.s.feitos}x feito</small></div>${niveisHtml(x.s.nivel)}</div>`).join('')}</section>`;
  }

  const motivos = {};
  Object.values(st.planos).forEach(p => p.tarefas.forEach(t => { if (t.motivo) motivos[t.motivo] = (motivos[t.motivo] || 0) + 1; }));
  const totMot = Object.values(motivos).reduce((s, n) => s + n, 0);
  if (totMot) {
    html += `<section class="cartao"><h2>Seus obstáculos</h2>
      ${Object.entries(motivos).sort((a, b) => b[1] - a[1]).map(([k, n]) => `
        <div class="barra-h"><span>${MOTIVOS[k].icone} ${MOTIVOS[k].nome}</span><div><i style="width:${n / totMot * 100}%"></i></div><b>${n}</b></div>`).join('')}</section>`;
  }
  return html;
}

function grafico14(h) {
  const W = 320, H = 130, base = 104, alt = 92;
  const dias = Array.from({ length: 14 }, (_, i) => somarDias(h, i - 13));
  const passo = W / 14;
  let barras = '', pts = [], rotulos = '';
  dias.forEach((d, i) => {
    const p = st.planos[d];
    const r = p ? p.tarefas.filter(t => t.status !== 'pendente' || d === h) : [];
    const taxa = r.length ? r.filter(t => t.status === 'feita').length / r.length : 0;
    const x = i * passo + passo * 0.2, w = passo * 0.6;
    if (r.length) barras += `<rect x="${x}" y="${base - taxa * alt}" width="${w}" height="${Math.max(taxa * alt, 1.5)}" rx="3" class="g-barra"><title>${d.slice(8)}/${d.slice(5, 7)}: ${Math.round(taxa * 100)}%</title></rect>`;
    const e = st.diario[d]?.energia;
    if (e) pts.push(`${i * passo + passo / 2},${base - (e / 10) * alt}`);
    if (i % 2 === 1 || i === 13) rotulos += `<text x="${i * passo + passo / 2}" y="${H - 8}" text-anchor="middle">${d.slice(8)}</text>`;
  });
  const linha = pts.length > 1 ? `<polyline points="${pts.join(' ')}" class="g-linha"/>` : '';
  const pontos = pts.map(p => `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="2.5" class="g-ponto"/>`).join('');
  return `<svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="Execução e energia nos últimos 14 dias">
    <line x1="0" x2="${W}" y1="${base}" y2="${base}" class="g-eixo"/>
    <line x1="0" x2="${W}" y1="${base - alt / 2}" y2="${base - alt / 2}" class="g-grade"/>
    <line x1="0" x2="${W}" y1="${base - alt}" y2="${base - alt}" class="g-grade"/>
    ${barras}${linha}${pontos}${rotulos}</svg>`;
}

/* ===================== AJUSTES ===================== */
function viewAjustes() {
  const p = st.perfil;
  const notif = 'Notification' in window ? Notification.permission : 'indisponivel';
  return `<div class="cab-secao"><h1>Ajustes</h1></div>
  ${blocoConta()}
  <section class="cartao">
    <h2>Perfil</h2>
    <label class="campo">Nome<input data-perfil="nome" value="${esc(p.nome)}"></label>
    <label class="campo">Pico de energia
      <select data-perfil="pico">${Object.entries(PERIODOS).map(([k, n]) => `<option value="${k}" ${p.pico === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label class="campo">Tempo diário disponível
      <select data-perfil="minutos">${[10, 15, 20, 30, 45, 60, 90].map(m => `<option value="${m}" ${p.minutos == m ? 'selected' : ''}>${m} minutos</option>`).join('')}</select>
      <small>Vale a partir do próximo plano gerado.</small></label>
  </section>
  <section class="cartao">
    <h2>Rotina (âncoras)</h2>
    <p class="sub">Momentos que já acontecem todo dia. Cada tarefa é encaixada logo depois de um deles.</p>
    ${p.ancoras.map((a, i) => `
      <div class="linha-ancora">
        <input data-ancora="${i}" data-campo="texto" value="${esc(a.texto)}">
        <input type="time" data-ancora="${i}" data-campo="hora" value="${a.hora}">
        <button class="icone-btn" data-acao="remover-ancora" data-i="${i}" aria-label="Remover">✕</button>
      </div>`).join('')}
    <button class="btn" data-acao="adicionar-ancora">+ Adicionar momento</button>
  </section>
  <section class="cartao">
    <h2>Lembretes</h2>
    ${notif === 'indisponivel' ? '<p class="sub">Este navegador não suporta notificações.</p>' : `
      <p class="sub">Aviso no horário de cada âncora enquanto o app estiver aberto (ou instalado na tela inicial).</p>
      <label class="alternar"><input type="checkbox" data-acao-change="lembretes" ${p.lembretes && notif === 'granted' ? 'checked' : ''}> Ativar lembretes</label>
      ${notif === 'denied' ? '<p class="sub">As notificações estão bloqueadas nas configurações do navegador.</p>' : ''}`}
  </section>
  <section class="cartao">
    <h2>Plano de hoje</h2>
    <p class="sub">Mudou a rotina ou os objetivos? Gere o plano de hoje de novo (o que já foi feito é mantido).</p>
    <button class="btn" data-acao="regerar">Gerar plano de hoje novamente</button>
  </section>
  <section class="cartao">
    <h2>Seus dados</h2>
    <p class="sub">Tudo fica salvo neste aparelho${window.Nuvem?.estado.usuario ? ' e na sua conta na nuvem' : ''}. O backup em arquivo é uma cópia extra de segurança.</p>
    <div class="acoes">
      <button class="btn" data-acao="exportar">Exportar backup</button>
      <label class="btn">Importar backup<input type="file" accept=".json,application/json" id="inp-importar" hidden></label>
      <button class="link perigo" data-acao="apagar-tudo">apagar tudo</button>
    </div>
  </section>
  <section class="cartao sobre">
    <h2>Sobre o método</h2>
    <p><b>Neurociência:</b> neuroplasticidade (o que se repete se fortalece), dopamina e celebração, sono, luz, respiração e o papel do córtex pré-frontal no autocontrole.</p>
    <p><b>PNL:</b> ancoragem, reenquadramento, modelagem, rapport, padrão swish e níveis neurológicos (identidade).</p>
    <p><b>Comportamento e hábitos:</b> Tiny Habits (B.J. Fogg), Hábitos Atômicos (James Clear), loop do hábito (Duhigg), intenções de implementação (Gollwitzer), WOOP (Oettingen), design de ambiente e surfar o impulso (Marlatt).</p>
    <p><b>Produtividade:</b> regra dos 2 minutos, Pomodoro, prática deliberada, Pareto e prioridade do dia.</p>
    <p><b>Energia, vibração e física quântica:</b> aqui, "vibração" é o seu estado emocional e fisiológico — humor, energia e coerência cardíaca —, que pode ser medido e treinado. A física quântica entra apenas como metáfora inspiradora (atenção e observação moldando a realidade); o que a ciência comprova de fato é que aquilo em que você foca e repete é amplificado no cérebro.</p>
    <p class="sub">Este app não substitui acompanhamento médico ou psicológico. Para dependências químicas ou sofrimento intenso, procure um profissional.</p>
  </section>`;
}

function blocoConta() {
  const n = window.Nuvem?.estado;
  let corpo;
  if (!n) corpo = '<p class="sub">Sincronização indisponível.</p>';
  else if (!n.disponivel) corpo = `<p class="sub">${esc(n.carregando ? 'Conectando…' : n.erro)}</p>`;
  else if (n.carregando) corpo = '<p class="sub">Conectando…</p>';
  else if (!n.usuario) {
    corpo = `<p class="sub">Entre com sua conta Google para guardar seus dados na nuvem e usar o app em vários aparelhos (celular e computador).</p>
      <button class="btn primario" data-acao="nuvem-entrar">Entrar com Google</button>`;
  } else {
    const hora = n.ultimoSync ? new Date(n.ultimoSync).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null;
    const status = n.status === 'sincronizando' ? '<span class="sync">↻ Sincronizando…</span>'
      : n.status === 'erro' ? `<span class="sync erro">⚠ ${esc(n.erro)}</span>`
      : hora ? `<span class="sync ok">✓ Sincronizado às ${hora}</span>` : '';
    corpo = `<div class="conta">
        ${n.usuario.foto ? `<img src="${esc(n.usuario.foto)}" alt="" referrerpolicy="no-referrer">` : '<span class="avatar">👤</span>'}
        <div><b>${esc(n.usuario.nome || 'Conta Google')}</b><small>${esc(n.usuario.email)}</small></div>
      </div>
      <p>${status}</p>
      <div class="acoes">
        <button class="btn" data-acao="nuvem-sync">Sincronizar agora</button>
        <button class="link" data-acao="nuvem-sair">sair da conta</button>
      </div>`;
  }
  return `<section class="cartao"><h2>☁️ Conta e nuvem</h2>${corpo}</section>`;
}

/* ===================== Ações ===================== */
const acoes = {
  ir(el) { rota = el.dataset.rota; ui.editObj = ui.editPad = ui.editCrenca = null; render(); window.scrollTo(0, 0); },

  'onb-pico'(el) { ui.onb.pico = el.dataset.v; render(); },
  'onb-comecar'() {
    const o = ui.onb;
    if (!o.nome.trim()) return toast('Digite seu nome para começarmos.');
    st.perfil = { nome: o.nome.trim(), pico: o.pico, minutos: +o.minutos, lembretes: false,
      ancoras: o.ancoras.map(a => ({ ...a, periodo: periodoDaHora(a.hora) })), criadoEm: new Date().toISOString() };
    st.avisos.push({ tipo: 'sucesso', texto: `Bem-vindo(a), ${st.perfil.nome}! Comece com o que é fácil. Consistência primeiro, intensidade depois.` });
    iniciarDia();
    rota = 'objetivos'; ui.editObj = 'novo'; render(); window.scrollTo(0, 0);
  },

  'nuvem-entrar'() { window.Nuvem?.entrar(); },
  'nuvem-sair'() { window.Nuvem?.sair(); },
  'nuvem-sync'() { window.Nuvem?.sincronizar(); },

  'fechar-aviso'(el) { st.avisos = st.avisos.filter(a => a.texto !== el.dataset.texto); salvar(); render(); },
  'humor-rapido'(el) { entradaDiario(hoje()).humor = +el.dataset.v; salvar(); render(); },
  'modo-leve'() { const n = aplicarModoLeve(st, hoje()); salvar(); render(); toast(`${n} tarefa(s) ficaram mais leves hoje. Cuide-se.`); },
  detalhes(el) { const id = el.dataset.id; ui.abertos.has(id) ? ui.abertos.delete(id) : ui.abertos.add(id); render(); },

  concluir(el) {
    const r = concluir(st, hoje(), el.dataset.id);
    salvar();
    if (r.tipo === 'nivel') ui.modal = { tipo: 'msg', icone: '🚀', titulo: 'Novo nível!', texto: r.texto };
    render();
    if (r.tipo !== 'nivel') toast(r.texto);
    const plano = st.planos[hoje()];
    if (plano.tarefas.every(t => t.status !== 'pendente') && r.tipo !== 'nivel') {
      setTimeout(() => toast('🏆 Plano de hoje concluído! Seu cérebro está aprendendo que você cumpre o que promete.', 5500), 1800);
    }
  },
  falhar(el) { ui.modal = { tipo: 'falha', etapa: 'motivo', id: el.dataset.id }; render(); },
  motivo(el) {
    const r = falhar(st, hoje(), ui.modal.id, el.dataset.motivo);
    salvar();
    ui.modal = { ...ui.modal, etapa: 'resultado', texto: r.texto };
    render();
  },
  'versao-facil'() {
    criarVersaoFacil(st, hoje(), ui.modal.id);
    ui.modal = null; salvar(); render();
    toast('Pronto! Uma versão menor foi adicionada ao plano de hoje.');
  },
  desfazer(el) {
    const t = st.planos[hoje()].tarefas.find(x => x.id === el.dataset.id);
    if (t.trocaPrimario) { const o = st.objetivos.find(x => x.id === t.refId); if (o) o.primario = t.trocaPrimario; delete t.trocaPrimario; }
    desfazer(st, hoje(), el.dataset.id); salvar(); render();
  },
  'fechar-modal'() { ui.modal = null; render(); },
  'fundo-modal'(el, ev) { if (ev.target === el && ui.modal?.tipo !== 'impulso') { ui.modal = null; render(); } },

  'novo-objetivo'() { rota = 'objetivos'; ui.editObj = 'novo'; render(); window.scrollTo(0, 0); },
  'editar-objetivo'(el) { ui.editObj = el.dataset.id; render(); window.scrollTo(0, 0); },
  'cancelar-edicao'() { ui.editObj = ui.editPad = ui.editCrenca = null; render(); },
  'arquivar-objetivo'(el) {
    const o = st.objetivos.find(x => x.id === el.dataset.id);
    o.ativo = !o.ativo;
    if (o.ativo) incluirNoPlanoHoje('meta', o.id, o.primario); else removerPendentesDe(o.id);
    salvar(); render();
  },
  'excluir-objetivo'(el) {
    const o = st.objetivos.find(x => x.id === el.dataset.id);
    if (!confirm(`Excluir o objetivo "${o.titulo}"? O histórico de tarefas permanece.`)) return;
    st.objetivos = st.objetivos.filter(x => x.id !== o.id);
    removerPendentesDe(o.id);
    Object.keys(st.skills).filter(k => k.startsWith(o.id + '|')).forEach(k => delete st.skills[k]);
    st.extras = st.extras.filter(e => e.refId !== o.id);
    salvar(); render();
  },

  'novo-padrao'() { ui.editPad = 'novo'; render(); window.scrollTo(0, 0); },
  'editar-padrao'(el) { ui.editPad = el.dataset.id; render(); window.scrollTo(0, 0); },
  'arquivar-padrao'(el) {
    const p = st.padroes.find(x => x.id === el.dataset.id);
    p.ativo = !p.ativo; if (!p.ativo) removerPendentesDe(p.id);
    salvar(); render();
  },
  'excluir-padrao'(el) {
    const p = st.padroes.find(x => x.id === el.dataset.id);
    if (!confirm(`Excluir "${p.nome}" e seus registros?`)) return;
    st.padroes = st.padroes.filter(x => x.id !== p.id);
    removerPendentesDe(p.id);
    Object.keys(st.skills).filter(k => k.startsWith(p.id + '|')).forEach(k => delete st.skills[k]);
    st.extras = st.extras.filter(e => e.refId !== p.id);
    salvar(); render();
  },
  'sugerir-substituto'(el) { document.getElementById('inp-substituto').value = el.dataset.v; },
  impulso(el) { ui.modal = { tipo: 'impulso', padId: el.dataset.id, resistiu: null, sentimentos: [], contexto: '' }; render(); },
  'imp-res'(el) { ui.modal.resistiu = el.dataset.v === '1'; render(); },
  'imp-sent'(el) {
    const s = ui.modal.sentimentos, v = el.dataset.v;
    ui.modal.sentimentos = s.includes(v) ? s.filter(x => x !== v) : [...s, v]; render();
  },
  'imp-salvar'() {
    const m = ui.modal;
    const p = st.padroes.find(x => x.id === m.padId);
    const agora = new Date();
    p.registros.push({ data: hoje(), hora: agora.toTimeString().slice(0, 5), resistiu: m.resistiu, sentimentos: m.sentimentos, contexto: m.contexto });
    let msg;
    if (m.resistiu) {
      const n = p.registros.filter(r => r.resistiu).length;
      msg = { icone: '💪', titulo: 'Impulso vencido!', texto: `Esta é a sua ${n}ª vitória sobre "${p.nome}". Cada vez que você resiste, o circuito antigo enfraquece e o novo se fortalece. Celebre!` };
    } else {
      const amanha = somarDias(hoje(), 1);
      if (!st.extras.some(e => e.refId === p.id && e.data === amanha)) {
        st.extras.push({ data: amanha, tplId: 'substituir', tipo: 'padrao', refId: p.id });
      }
      msg = { icone: '🤍', titulo: 'Tudo bem. Isso é informação.', texto: `Recaídas fazem parte de qualquer mudança — o que atrapalha é o pensamento "já que errei, tanto faz". Você registrou, e isso já é consciência. ${m.sentimentos.length ? `O sentimento por trás foi: ${m.sentimentos.join(', ').toLowerCase()}. ` : ''}Amanhã incluí uma tarefa para treinar sua nova rotina no lugar de "${p.nome}".` };
    }
    ui.modal = { tipo: 'msg', ...msg };
    salvar(); render();
  },
  'nova-crenca'() { ui.editCrenca = 'novo'; render(); window.scrollTo(0, 0); },
  'editar-crenca'(el) { ui.editCrenca = el.dataset.id; render(); window.scrollTo(0, 0); },
  'excluir-crenca'(el) {
    if (!confirm('Excluir esta crença?')) return;
    st.crencas = st.crencas.filter(x => x.id !== el.dataset.id); salvar(); render();
  },

  'diario-humor'(el) { entradaDiario(hoje()).humor = +el.dataset.v; salvar(); render(); },
  'diario-sent'(el) {
    const e = entradaDiario(hoje()); const s = e.sentimentos || []; const v = el.dataset.v;
    e.sentimentos = s.includes(v) ? s.filter(x => x !== v) : [...s, v]; salvar(); render();
  },
  'diario-tipo'(el) { const e = entradaDiario(hoje()); e.tipoPensamento = e.tipoPensamento === el.dataset.v ? null : el.dataset.v; salvar(); render(); },
  'guardar-crenca'() {
    const e = entradaDiario(hoje());
    if (!e.pensamento?.trim()) return toast('Escreva primeiro o pensamento.');
    st.crencas.push({ id: uid(), crenca: e.pensamento.trim(), reenquadre: (e.reenquadre || '').trim(), criadoEm: new Date().toISOString() });
    salvar(); toast('Guardada em Padrões → Crenças. Ela vai aparecer como sua crença do dia.');
  },

  'adicionar-ancora'() { st.perfil.ancoras.push({ id: uid(), texto: 'novo momento da rotina', hora: '10:00', periodo: 'manha' }); salvar(); render(); },
  'remover-ancora'(el) {
    if (st.perfil.ancoras.length <= 2) return toast('Mantenha pelo menos 2 momentos na rotina.');
    st.perfil.ancoras.splice(+el.dataset.i, 1); salvar(); render();
  },
  regerar() {
    const h = hoje(); const antigo = st.planos[h];
    delete st.planos[h];
    const novo = gerarPlano(st, h);
    if (antigo) {
      novo.tarefas.forEach(t => {
        const o = antigo.tarefas.find(x => x.chave === t.chave && x.status !== 'pendente');
        if (o) { Object.assign(t, { status: o.status, motivo: o.motivo, feitaEm: o.feitaEm, nivel: o.nivel, skillAntes: o.skillAntes }); atualizarTexto(st, t); }
      });
    }
    salvar(); rota = 'hoje'; render(); toast('Plano de hoje atualizado.');
  },
  exportar() {
    const blob = new Blob([JSON.stringify(st, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `caminho-sucesso-backup-${hoje()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  'apagar-tudo'() {
    const conectado = window.Nuvem?.estado.usuario;
    if (!confirm(conectado
      ? 'Apagar todos os dados DESTE APARELHO e sair da conta? Os dados na nuvem continuam guardados e podem ser restaurados entrando de novo.'
      : 'Apagar TODOS os dados deste app? Isso não pode ser desfeito.')) return;
    window.Nuvem?.desconectar();
    st = estadoInicial(); ui.onb = null; salvar(); render();
  },
};

/* ===================== Eventos ===================== */
document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-acao]');
  if (!el || !acoes[el.dataset.acao]) return;
  if (el.tagName === 'BUTTON' && el.type === 'button' && el.closest('form')) ev.preventDefault();
  acoes[el.dataset.acao](el, ev);
});

document.addEventListener('submit', ev => {
  ev.preventDefault();
  if (ev.target.id === 'form-objetivo') salvarObjetivo(ev.target);
  if (ev.target.id === 'form-padrao') salvarPadrao(ev.target);
  if (ev.target.id === 'form-crenca') salvarCrenca(ev.target);
});

let tSalvar;
document.addEventListener('input', ev => {
  const el = ev.target;
  if (el.dataset.onb) ui.onb[el.dataset.onb] = el.value;
  else if (el.dataset.onbAncora) ui.onb.ancoras[+el.dataset.onbAncora][el.dataset.campo] = el.value;
  else if (el.dataset.modal) ui.modal[el.dataset.modal] = el.value;
  else if (el.dataset.campo && rota === 'diario' && !el.dataset.ancora) {
    const e = entradaDiario(hoje());
    e[el.dataset.campo] = el.type === 'range' ? +el.value : el.value;
    if (el.type === 'range') document.getElementById('val-energia').textContent = el.value;
    clearTimeout(tSalvar); tSalvar = setTimeout(salvar, 400);
  }
});

document.addEventListener('change', ev => {
  const el = ev.target;
  if (el.id === 'sel-area') {
    document.getElementById('sel-primario').innerHTML = opcoesPrimario(el.value, AREAS[el.value].primario);
    document.getElementById('inp-identidade').placeholder = IDENTIDADE_EXEMPLO[el.value];
  } else if (el.dataset.perfil) {
    st.perfil[el.dataset.perfil] = el.dataset.perfil === 'minutos' ? +el.value : el.value;
    salvar(); toast('Salvo.');
  } else if (el.dataset.ancora) {
    const a = st.perfil.ancoras[+el.dataset.ancora];
    a[el.dataset.campo] = el.value;
    a.periodo = periodoDaHora(a.hora);
    const plano = st.planos[hoje()];
    if (plano) ordenarTarefas(st, plano.tarefas);
    salvar(); toast('Rotina atualizada.');
  } else if (el.dataset.acaoChange === 'lembretes') {
    alternarLembretes(el.checked);
  } else if (el.id === 'inp-importar' && el.files[0]) {
    importar(el.files[0]);
  }
});

function importar(arquivo) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const dados = JSON.parse(r.result);
      if (!dados.versao || !Array.isArray(dados.objetivos)) throw new Error('formato');
      if (!confirm('Substituir os dados atuais pelo backup?')) return;
      st = Object.assign(estadoInicial(), dados);
      iniciarDia(); rota = 'hoje'; render(); toast('Backup restaurado.');
    } catch (e) { toast('Arquivo de backup inválido.'); }
  };
  r.readAsText(arquivo);
}

/* ===================== Lembretes ===================== */
async function alternarLembretes(ligar) {
  if (ligar && Notification.permission !== 'granted') {
    const p = await Notification.requestPermission();
    if (p !== 'granted') { st.perfil.lembretes = false; salvar(); render(); return toast('Permissão de notificação não concedida.'); }
  }
  st.perfil.lembretes = ligar; salvar(); render();
  if (ligar) notificar('Lembretes ativados', 'Vou te avisar no momento de cada micro-ação.');
}
function notificar(titulo, corpo) {
  const opts = { body: corpo, icon: 'icon.svg', badge: 'icon.svg', tag: titulo };
  if (navigator.serviceWorker?.controller) navigator.serviceWorker.ready.then(r => r.showNotification(titulo, opts));
  else try { new Notification(titulo, opts); } catch (e) { /* sem suporte */ }
}
function verificarLembretes() {
  if (!st.perfil?.lembretes || !('Notification' in window) || Notification.permission !== 'granted') return;
  const plano = st.planos[hoje()]; if (!plano) return;
  const agora = new Date();
  const min = agora.getHours() * 60 + agora.getMinutes();
  let mudou = false;
  plano.tarefas.forEach(t => {
    if (t.status !== 'pendente' || t.notificada) return;
    const a = ancoraPorId(st, t.ancoraId); if (!a) return;
    const [hh, mm] = a.hora.split(':').map(Number);
    const diff = min - (hh * 60 + mm);
    if (diff >= 0 && diff < 45) {
      notificar(`Depois de ${a.texto}…`, t.titulo);
      t.notificada = true; mudou = true;
    }
  });
  if (mudou) salvar();
}

/* ===================== Início ===================== */
let diaAtual = hoje();
function checarVirada() {
  if (hoje() !== diaAtual) { diaAtual = hoje(); iniciarDia(); if (!ui.modal && !ui.editObj && !ui.editPad && !ui.editCrenca) render(); }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checarVirada(); });
setInterval(() => { checarVirada(); verificarLembretes(); }, 30000);

iniciarDia();
render();
verificarLembretes();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

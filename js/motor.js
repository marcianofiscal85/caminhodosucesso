/* Motor de adaptação: gera o plano do dia, ajusta níveis e âncoras conforme
   sucessos e dificuldades, e extrai padrões do histórico. */

const NIVEL_MAX = 4;
const SUBIR_APOS = 3;          // sucessos seguidos para subir de nível
const DESCER_APOS_PULOS = 2;   // tarefas não registradas seguidas para descer

/* ---------- Datas ---------- */
function dataLocal(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function diaNum(data) {
  const [a, m, d] = data.split('-').map(Number);
  return Math.floor(Date.UTC(a, m - 1, d) / 86400000);
}
function somarDias(data, n) {
  const [a, m, d] = data.split('-').map(Number);
  return dataLocal(new Date(a, m - 1, d + n));
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ---------- Textos ---------- */
function preencher(texto, ctx) {
  return texto.replace(/\{(\w+)\}/g, (_, k) => (ctx[k] && String(ctx[k]).trim()) || PADROES_TEXTO[k] || '');
}
function ctxDe(st, tipo, refId) {
  if (tipo === 'meta') {
    const o = st.objetivos.find(x => x.id === refId);
    return o ? { meta: o.titulo, identidade: o.identidade } : {};
  }
  if (tipo === 'padrao') {
    const p = st.padroes.find(x => x.id === refId);
    return p ? { padrao: p.nome, gatilho: p.gatilho, substituto: p.substituto } : {};
  }
  return {};
}

/* ---------- Âncoras ---------- */
function ancoras(st) {
  return [...st.perfil.ancoras].sort((a, b) => a.hora.localeCompare(b.hora));
}
function ancoraPorId(st, id) {
  return st.perfil.ancoras.find(a => a.id === id);
}
function periodoDe(st, tpl) {
  return tpl.periodo === 'pico' ? st.perfil.pico : tpl.periodo;
}
function usoAncoras(st, data) {
  const uso = {};
  (st.planos[data]?.tarefas || []).forEach(t => {
    if (t.status === 'pendente' || t.status === 'feita') uso[t.ancoraId] = (uso[t.ancoraId] || 0) + 1;
  });
  return uso;
}
function escolherAncora(st, periodo, uso, excluir) {
  const lista = ancoras(st).filter(a => a.id !== excluir);
  const doPeriodo = lista.filter(a => a.periodo === periodo);
  const cand = (doPeriodo.length ? doPeriodo : lista)
    .slice().sort((a, b) => (uso[a.id] || 0) - (uso[b.id] || 0));
  return cand[0]?.id || lista[0]?.id;
}

/* ---------- Habilidades (estado adaptativo de cada tarefa) ---------- */
function chaveDe(tipo, refId, tplId) {
  return `${tipo === 'estado' ? 'estado' : refId}|${tplId}`;
}
function skill(st, chave) {
  if (!st.skills[chave]) st.skills[chave] = { nivel: 0, seq: 0, falhas: 0, feitos: 0, ancoraId: null, lembrete: false };
  return st.skills[chave];
}

function montarTarefa(st, tpl, tipo, refId, uso, opts = {}) {
  const chave = chaveDe(tipo, refId, tpl.id);
  const sk = skill(st, chave);
  if (!sk.ancoraId || !ancoraPorId(st, sk.ancoraId)) sk.ancoraId = escolherAncora(st, periodoDe(st, tpl), uso);
  const nivel = Math.max(0, Math.min(NIVEL_MAX, sk.nivel + (opts.deltaNivel || 0)));
  uso[sk.ancoraId] = (uso[sk.ancoraId] || 0) + 1;
  return {
    id: uid(), chave, tplId: tpl.id, tipo, refId, nivel,
    titulo: preencher(tpl.niveis[nivel].t, ctxDe(st, tipo, refId)),
    minutos: tpl.niveis[nivel].min,
    ancoraId: sk.ancoraId,
    primaria: !!opts.primaria,
    status: 'pendente',
  };
}
function atualizarTexto(st, t) {
  const tpl = TPL[t.tplId];
  t.titulo = preencher(tpl.niveis[t.nivel].t, ctxDe(st, t.tipo, t.refId));
  t.minutos = tpl.niveis[t.nivel].min;
}

/* ---------- Métricas ---------- */
function tarefasEntre(st, de, ate) {
  const out = [];
  for (const [data, p] of Object.entries(st.planos)) {
    if (data >= de && data < ate) p.tarefas.forEach(t => out.push({ ...t, data }));
  }
  return out;
}
function taxaSucesso(st, dias, ate) {
  const ts = tarefasEntre(st, somarDias(ate, -dias), ate).filter(t => t.status !== 'pendente');
  const feitas = ts.filter(t => t.status === 'feita').length;
  return { taxa: ts.length ? feitas / ts.length : 0, total: ts.length, feitas };
}
function sequenciaDias(st, hoje) {
  let d = st.planos[hoje]?.tarefas.some(t => t.status === 'feita') ? hoje : somarDias(hoje, -1);
  let n = 0;
  while (st.planos[d]?.tarefas.some(t => t.status === 'feita')) { n++; d = somarDias(d, -1); }
  return n;
}

/* ---------- Fechamento de dias passados ---------- */
function fecharDiasAnteriores(st, hoje) {
  let puladas = 0; const aliviadas = new Set();
  for (const [data, p] of Object.entries(st.planos)) {
    if (data >= hoje || p.fechado) continue;
    p.tarefas.forEach(t => {
      if (t.status !== 'pendente') return;
      t.status = 'pulada'; puladas++;
      const sk = skill(st, t.chave);
      sk.seq = 0; sk.falhas++;
      if (sk.falhas >= DESCER_APOS_PULOS && sk.nivel > 0) {
        sk.nivel--; sk.falhas = 0; aliviadas.add(TPL[t.tplId].nome);
      }
    });
    p.fechado = true;
  }
  if (puladas) {
    let msg = `${puladas} tarefa(s) de dias anteriores ficaram sem registro.`;
    if (aliviadas.size) msg += ` Deixei mais leve: ${[...aliviadas].join(', ')}.`;
    msg += ' Sem culpa — o que importa é o próximo passo.';
    st.avisos.push({ tipo: 'info', texto: msg });
  }
}

/* ---------- Geração do plano diário ---------- */
function rotacionar(arr, n) {
  if (!arr.length) return arr;
  const k = ((n % arr.length) + arr.length) % arr.length;
  return arr.slice(k).concat(arr.slice(0, k));
}
function poolSecundario(o) {
  const pool = TEMPLATES.filter(t => t.tipo === 'meta' && t.id !== o.primario &&
    (t.areas.includes(o.area) || t.areas.includes('*')));
  // O próximo passo concreto é o que mais acelera o objetivo — aparece com mais frequência
  if (o.primario !== 'proximo-passo') pool.push(TPL['proximo-passo']);
  return pool;
}

function gerarPlano(st, data) {
  if (st.planos[data]) return st.planos[data];

  const dn = diaNum(data);
  const tx = taxaSucesso(st, 7, data);
  let modo = 'normal';
  const ausencia = st.ultimaAbertura ? diaNum(data) - diaNum(st.ultimaAbertura) : 0;
  if (ausencia >= 3 || (tx.total >= 5 && tx.taxa < 0.4)) modo = 'leve';
  else if (tx.total >= 10 && tx.taxa >= 0.85) modo = 'intenso';

  const uso = {};
  const tarefas = [];
  const delta = modo === 'leve' ? -1 : 0;

  // 1) Estado / energia: um por dia, em rotação
  const estados = TEMPLATES.filter(t => t.tipo === 'estado');
  tarefas.push(montarTarefa(st, estados[dn % estados.length], 'estado', null, uso, { deltaNivel: delta, primaria: true }));

  // 2) Hábito principal de cada objetivo (até 3 por dia; se houver mais, revezam)
  const objs = st.objetivos.filter(o => o.ativo);
  const maxObj = modo === 'leve' ? 2 : 3;
  const sel = objs.length <= maxObj ? objs : rotacionar(objs, dn).slice(0, maxObj);
  sel.forEach(o => tarefas.push(montarTarefa(st, TPL[o.primario], 'meta', o.id, uso, { deltaNivel: delta, primaria: true })));

  // 3) Padrão a transformar (um por dia, em rotação)
  const pads = st.padroes.filter(p => p.ativo);
  if (pads.length && (modo !== 'leve' || dn % 2 === 0)) {
    const p = pads[dn % pads.length];
    const pool = TEMPLATES.filter(t => t.tipo === 'padrao');
    tarefas.push(montarTarefa(st, pool[Math.floor(dn / pads.length) % pool.length], 'padrao', p.id, uso, { deltaNivel: delta, primaria: true }));
  }

  // 4) Extras agendados por adaptações de ontem (ex.: ambiente, reenquadre)
  const extras = st.extras.filter(e => e.data <= data);
  st.extras = st.extras.filter(e => e.data > data);
  extras.forEach(e => {
    if (tarefas.some(t => t.tplId === e.tplId && t.refId === e.refId)) return;
    if (e.tipo === 'meta' && !st.objetivos.some(o => o.id === e.refId && o.ativo)) return;
    tarefas.push(montarTarefa(st, TPL[e.tplId], e.tipo, e.refId, uso, { primaria: true }));
  });

  // 5) Tarefas complementares por objetivo (cortadas pelo orçamento de tempo)
  if (modo !== 'leve') {
    sel.forEach((o, i) => {
      const pool = poolSecundario(o);
      const tpl = pool[(dn + i) % pool.length];
      if (tarefas.some(t => t.tplId === tpl.id && t.refId === o.id)) return;
      tarefas.push(montarTarefa(st, tpl, 'meta', o.id, uso));
    });
  }

  // 6) Ajuste ao tempo disponível
  const orcamento = st.perfil.minutos * (modo === 'intenso' ? 1.25 : 1);
  const total = () => tarefas.reduce((s, t) => s + t.minutos, 0);
  for (let i = tarefas.length - 1; i >= 0 && total() > orcamento; i--) {
    if (!tarefas[i].primaria) tarefas.splice(i, 1);
  }
  let guarda = 50;
  while (total() > orcamento && guarda--) {
    const maior = tarefas.filter(t => t.nivel > 0).sort((a, b) => b.minutos - a.minutos)[0];
    if (!maior) break;
    maior.nivel--; atualizarTexto(st, maior);
  }

  ordenarTarefas(st, tarefas);
  st.planos[data] = { tarefas, modo };
  if (modo === 'leve') {
    st.avisos.push({ tipo: 'leve', texto: ausencia >= 3
      ? 'Que bom ter você de volta! Recomeçar faz parte do processo. Hoje o plano está mais leve para retomar o ritmo.'
      : 'Percebi que os últimos dias foram difíceis. Hoje o plano está mais leve — pequenas vitórias reconstroem o impulso.' });
  } else if (modo === 'intenso') {
    st.avisos.push({ tipo: 'sucesso', texto: 'Você está numa ótima sequência! Liberei um pouco mais de desafio hoje.' });
  }
  return st.planos[data];
}

function ordenarTarefas(st, tarefas) {
  tarefas.sort((a, b) => (ancoraPorId(st, a.ancoraId)?.hora || '').localeCompare(ancoraPorId(st, b.ancoraId)?.hora || ''));
}

/* ---------- Conclusão ---------- */
function concluir(st, data, id) {
  const t = st.planos[data].tarefas.find(x => x.id === id);
  const sk = skill(st, t.chave);
  t.skillAntes = { ...sk };
  t.status = 'feita'; t.feitaEm = new Date().toISOString();
  sk.feitos++; sk.falhas = 0;
  let subiu = false;
  if (t.nivel >= sk.nivel) sk.seq++;
  if (sk.seq >= SUBIR_APOS && sk.nivel < NIVEL_MAX) {
    sk.nivel++; sk.seq = 0; subiu = true;
  }
  const celebracao = CELEBRACOES[Math.floor(Math.random() * CELEBRACOES.length)];
  if (subiu) {
    const prox = preencher(TPL[t.tplId].niveis[sk.nivel].t, ctxDe(st, t.tipo, t.refId));
    return { texto: `Subiu de nível! ${SUBIR_APOS} vitórias seguidas mostram que isso já está ficando automático. A partir de amanhã: "${prox}"`, tipo: 'nivel' };
  }
  return { texto: celebracao, tipo: 'sucesso' };
}

function desfazer(st, data, id) {
  const t = st.planos[data].tarefas.find(x => x.id === id);
  if (t.skillAntes) st.skills[t.chave] = { ...t.skillAntes };
  delete t.skillAntes; delete t.motivo; delete t.feitaEm;
  if (t.extraAgendado) {
    st.extras = st.extras.filter(e => e.origem !== t.id);
    delete t.extraAgendado;
  }
  // remove uma versão adaptada criada a partir desta tarefa (se ainda não foi feita)
  const plano = st.planos[data];
  plano.tarefas = plano.tarefas.filter(x => !(x.adaptadaDe === t.id && x.status === 'pendente'));
  t.status = 'pendente';
}

/* ---------- Adaptação quando não consegue ---------- */
function falhar(st, data, id, motivo) {
  const plano = st.planos[data];
  const t = plano.tarefas.find(x => x.id === id);
  const tpl = TPL[t.tplId];
  const sk = skill(st, t.chave);
  t.skillAntes = { ...sk };
  t.status = 'falhou'; t.motivo = motivo;
  sk.seq = 0; sk.falhas++;

  const uso = usoAncoras(st, data);
  const nivelAntes = sk.nivel;
  const ancoraAntes = sk.ancoraId;
  const partes = [];
  const descer = n => { sk.nivel = Math.max(0, sk.nivel - n); };
  const agendarExtra = (tplId, tipo, refId) => {
    st.extras.push({ data: somarDias(data, 1), tplId, tipo, refId, origem: t.id });
    t.extraAgendado = true;
  };

  switch (motivo) {
    case 'tempo':
      descer(1);
      if (sk.nivel === nivelAntes) sk.ancoraId = escolherAncora(st, periodoDe(st, tpl), uso, sk.ancoraId);
      partes.push('Encolhi a tarefa para caber no seu dia. Pouco feito todo dia vence muito feito às vezes.');
      break;
    case 'esqueci': {
      const fortes = ANCORAS_FORTES.filter(a => a !== sk.ancoraId && ancoraPorId(st, a));
      const periodoAtual = ancoraPorId(st, sk.ancoraId)?.periodo;
      const forte = fortes.find(a => ancoraPorId(st, a).periodo === periodoAtual) || fortes[0];
      if (forte) sk.ancoraId = forte;
      sk.lembrete = true;
      if (sk.falhas >= 2) descer(1);
      partes.push('Esquecer é sinal de gatilho fraco, não de falta de capacidade. Liguei a tarefa a um momento que já acontece no automático e ativei um lembrete.');
      break;
    }
    case 'energia': {
      descer(1);
      const pico = escolherAncora(st, st.perfil.pico, uso, sk.ancoraId);
      if (pico) sk.ancoraId = pico;
      partes.push(`Movi a tarefa para o seu pico de energia (${PERIODOS[st.perfil.pico].toLowerCase()}) e reduzi o esforço.`);
      break;
    }
    case 'dificil':
      descer(2);
      partes.push('Dividi em um passo bem menor. O cérebro resiste ao que parece grande; um passo ridiculamente fácil desarma essa resistência.');
      break;
    case 'vontade':
      descer(1);
      agendarExtra('reenquadre', 'estado', null);
      partes.push('Resistência é normal: a motivação costuma vir DEPOIS da ação. Use a regra dos 5 segundos — conte 5, 4, 3, 2, 1 e comece antes que a mente negocie. Amanhã incluí um exercício para trabalhar o pensamento por trás dessa resistência.');
      break;
    case 'conflito': {
      const lista = ancoras(st);
      const idx = lista.findIndex(a => a.id === sk.ancoraId);
      const atual = lista[idx];
      const prox = lista.slice(idx + 1).concat(lista.slice(0, idx))
        .find(a => a.periodo !== atual?.periodo && (uso[a.id] || 0) < 2) || lista[(idx + 1) % lista.length];
      if (prox) sk.ancoraId = prox.id;
      partes.push('Mudei a tarefa para outro momento da sua rotina, para não competir com suas atividades.');
      break;
    }
    case 'ambiente':
      if (t.tipo === 'meta') agendarExtra('ambiente', 'meta', t.refId);
      else if (t.tipo === 'padrao') agendarExtra('friccao', 'padrao', t.refId);
      partes.push('O ambiente vence a força de vontade. Amanhã você terá uma tarefa rápida para ajustar o ambiente a seu favor.');
      break;
  }

  // Se já está no nível mínimo e continua difícil, troca a estratégia do objetivo
  if (sk.nivel === 0 && sk.falhas >= 3 && t.tipo === 'meta' && t.primaria) {
    const o = st.objetivos.find(x => x.id === t.refId);
    if (o && o.primario === t.tplId) {
      const alternativas = poolSecundario(o).filter(x => x.id !== o.primario);
      const nova = alternativas.find(x => !(st.skills[chaveDe('meta', o.id, x.id)]?.falhas >= 3)) || alternativas[0];
      if (nova) {
        t.trocaPrimario = o.primario;
        o.primario = nova.id;
        sk.falhas = 0;
        partes.push(`Como essa abordagem não está encaixando, troquei o hábito principal de "${o.titulo}" para "${nova.nome}". Existem vários caminhos para o mesmo objetivo.`);
      }
    }
  }

  const mudouNivel = sk.nivel !== nivelAntes;
  const mudouAncora = sk.ancoraId !== ancoraAntes;
  const a = ancoraPorId(st, sk.ancoraId);
  if (mudouNivel) partes.push(`Nova versão: "${preencher(tpl.niveis[sk.nivel].t, ctxDe(st, t.tipo, t.refId))}"`);
  if (mudouAncora && a) partes.push(`Novo momento: depois de ${a.texto} (${a.hora}).`);

  return { texto: partes.join(' '), podeVersaoFacil: true };
}

function criarVersaoFacil(st, data, id) {
  const plano = st.planos[data];
  const t = plano.tarefas.find(x => x.id === id);
  const sk = skill(st, t.chave);
  const nivel = Math.min(sk.nivel, Math.max(0, t.nivel - 1));
  const nova = {
    ...t, id: uid(), nivel, status: 'pendente', adaptadaDe: t.id, ancoraId: sk.ancoraId,
  };
  delete nova.motivo; delete nova.skillAntes; delete nova.extraAgendado; delete nova.trocaPrimario;
  atualizarTexto(st, nova);
  if (nivel === t.nivel) nova.titulo = 'Só o primeiro passo (30 segundos): ' + nova.titulo.charAt(0).toLowerCase() + nova.titulo.slice(1);
  plano.tarefas.push(nova);
  ordenarTarefas(st, plano.tarefas);
  return nova;
}

/* Dia difícil: reduz um nível de todas as pendentes, só para hoje */
function aplicarModoLeve(st, data) {
  const plano = st.planos[data];
  let n = 0;
  plano.tarefas.forEach(t => {
    if (t.status === 'pendente' && t.nivel > 0) { t.nivel--; atualizarTexto(st, t); n++; }
  });
  plano.modo = 'leve';
  return n;
}

/* ---------- Insights ---------- */
function insights(st, hoje) {
  const out = [];
  const ts = tarefasEntre(st, somarDias(hoje, -14), somarDias(hoje, 1));
  const resolvidas = ts.filter(t => t.status !== 'pendente');

  if (resolvidas.length < 5) {
    out.push({ icone: '🌱', texto: 'Continue registrando suas tarefas. Com alguns dias de dados eu começo a identificar seus padrões e adaptar o plano com mais precisão.' });
  }

  // Motivo mais comum
  const motivos = {};
  ts.filter(t => t.motivo).forEach(t => { motivos[t.motivo] = (motivos[t.motivo] || 0) + 1; });
  const topo = Object.entries(motivos).sort((a, b) => b[1] - a[1])[0];
  if (topo && topo[1] >= 2) {
    const dicas = {
      tempo: 'Tente "empilhar" tarefas em momentos que já existem, em vez de procurar tempo livre. Revise também os minutos disponíveis em Ajustes.',
      esqueci: 'Coloque um gatilho visual no local da âncora (um post-it, o objeto da tarefa à vista) e ative os lembretes.',
      energia: 'Proteja seu sono e use a tarefa de respiração/luz antes das outras. Energia é a base de tudo.',
      dificil: 'Os níveis estão descendo automaticamente. Lembre-se: o objetivo agora é consistência, não intensidade.',
      vontade: 'Investigue o sentimento por trás da resistência no Diário. Muitas vezes é medo de falhar ou perfeccionismo.',
      conflito: 'Revise sua rotina em Ajustes — talvez seus horários-âncora mudaram.',
      ambiente: 'Dedique 10 minutos no fim de semana para preparar o ambiente da semana.',
    };
    out.push({ icone: MOTIVOS[topo[0]].icone, texto: `Seu principal obstáculo nas últimas 2 semanas: "${MOTIVOS[topo[0]].nome}" (${topo[1]}x). ${dicas[topo[0]]}` });
  }

  // Período do dia com mais falhas
  const porPeriodo = {};
  resolvidas.forEach(t => {
    const p = ancoraPorId(st, t.ancoraId)?.periodo; if (!p) return;
    porPeriodo[p] = porPeriodo[p] || { ok: 0, n: 0 };
    porPeriodo[p].n++; if (t.status === 'feita') porPeriodo[p].ok++;
  });
  const periodos = Object.entries(porPeriodo).filter(([, v]) => v.n >= 4)
    .map(([p, v]) => [p, v.ok / v.n]).sort((a, b) => a[1] - b[1]);
  if (periodos.length >= 2 && periodos[periodos.length - 1][1] - periodos[0][1] >= 0.25) {
    const [pior, tp] = periodos[0]; const [melhor, tm] = periodos[periodos.length - 1];
    out.push({ icone: '🕐', texto: `Você conclui ${Math.round(tm * 100)}% das tarefas da ${PERIODOS[melhor].toLowerCase()}, mas só ${Math.round(tp * 100)}% das da ${PERIODOS[pior].toLowerCase()}. Quando algo falhar nesse período, marque "conflitou" e eu movo a tarefa.` });
  }

  // Estado emocional x execução
  const dias = Object.entries(st.diario).filter(([d, e]) => d >= somarDias(hoje, -30) && e.energia);
  const altos = [], baixos = [];
  dias.forEach(([d, e]) => {
    const p = st.planos[d]; if (!p) return;
    const r = p.tarefas.filter(t => t.status !== 'pendente'); if (!r.length) return;
    const taxa = r.filter(t => t.status === 'feita').length / r.length;
    (e.energia >= 7 ? altos : e.energia <= 4 ? baixos : []).push(taxa);
  });
  const media = a => a.reduce((s, x) => s + x, 0) / a.length;
  if (altos.length >= 2 && baixos.length >= 2) {
    out.push({ icone: '⚡', texto: `Nos dias com estado alto você executa ${Math.round(media(altos) * 100)}% do plano; nos dias de estado baixo, ${Math.round(media(baixos) * 100)}%. Elevar seu estado logo cedo (respiração, luz, movimento) é uma alavanca real para seus resultados.` });
  }

  // Sentimentos frequentes
  const sent = {};
  dias.forEach(([, e]) => (e.sentimentos || []).forEach(s => { sent[s] = (sent[s] || 0) + 1; }));
  const negativos = ['Cansado', 'Ansioso', 'Irritado', 'Triste', 'Desmotivado', 'Sobrecarregado'];
  const topNeg = Object.entries(sent).filter(([s]) => negativos.includes(s)).sort((a, b) => b[1] - a[1])[0];
  if (topNeg && topNeg[1] >= 3) {
    const sug = {
      Cansado: 'priorize o ritual de sono e a luz da manhã',
      Ansioso: 'use a respiração 4-6 sempre que notar a ansiedade e reduza estímulos à noite',
      Irritado: 'faça pausas ativas e observe que situações disparam a irritação',
      Triste: 'aumente as tarefas de conexão com pessoas e movimento ao ar livre',
      Desmotivado: 'reconecte-se com o "porquê" dos seus objetivos e celebre as pequenas vitórias',
      Sobrecarregado: 'reduza os minutos diários em Ajustes — menos é mais neste momento',
    };
    out.push({ icone: '💗', texto: `"${topNeg[0]}" apareceu ${topNeg[1]}x no seu diário no último mês. Sugestão: ${sug[topNeg[0]]}.` });
  }

  // Padrões: horário de maior risco
  st.padroes.filter(p => p.ativo && p.registros.length >= 3).forEach(p => {
    const horas = {};
    p.registros.forEach(r => { const h = Math.floor(parseInt(r.hora, 10) / 3) * 3; horas[h] = (horas[h] || 0) + 1; });
    const [h, n] = Object.entries(horas).sort((a, b) => b[1] - a[1])[0];
    const resistiu = p.registros.filter(r => r.resistiu).length;
    out.push({ icone: '🔁', texto: `"${p.nome}": o impulso aparece mais entre ${String(h).padStart(2, '0')}h e ${String(+h + 3).padStart(2, '0')}h (${n} de ${p.registros.length} registros). Você resistiu ${resistiu} vez(es). Prepare o substituto antes desse horário.` });
  });

  // Melhor dia da semana
  const semana = {};
  resolvidas.forEach(t => {
    const [a, m, d] = t.data.split('-').map(Number);
    const ds = new Date(a, m - 1, d).getDay();
    semana[ds] = semana[ds] || { ok: 0, n: 0 }; semana[ds].n++; if (t.status === 'feita') semana[ds].ok++;
  });
  const nomes = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const sem = Object.entries(semana).filter(([, v]) => v.n >= 3).map(([d, v]) => [d, v.ok / v.n]).sort((a, b) => a[1] - b[1]);
  if (sem.length >= 3) {
    out.push({ icone: '📆', texto: `Seu dia mais forte é ${nomes[sem[sem.length - 1][0]]} e o mais desafiador é ${nomes[sem[0][0]]}. No dia mais difícil, ative o "modo leve" logo cedo.` });
  }

  return out;
}

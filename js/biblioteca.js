/* Biblioteca de conhecimento: pilares, áreas, âncoras de rotina e modelos de tarefas.
   Cada modelo tem uma "escada" de 5 níveis (0 = mais fácil, 4 = mais desafiador).
   Placeholders: {meta} {identidade} {padrao} {gatilho} {substituto} */

const PILARES = {
  neuro:   { nome: 'Neurociência',     cor: '#7c6cf0' },
  pnl:     { nome: 'PNL',              cor: '#d6589a' },
  prod:    { nome: 'Produtividade',    cor: '#21998a' },
  comp:    { nome: 'Comportamento',    cor: '#d9822b' },
  habito:  { nome: 'Hábitos',          cor: '#3b82c4' },
  energia: { nome: 'Energia & Estado', cor: '#b8921c' },
};

const AREAS = {
  saude:           { nome: 'Saúde & Corpo',        icone: '💪', primario: 'movimento' },
  financas:        { nome: 'Finanças',             icone: '💰', primario: 'gastos' },
  carreira:        { nome: 'Carreira & Negócios',  icone: '🚀', primario: 'prioridade' },
  aprendizado:     { nome: 'Aprendizado',          icone: '📚', primario: 'leitura' },
  relacionamentos: { nome: 'Relacionamentos',      icone: '❤️', primario: 'conexao' },
  bemestar:        { nome: 'Mente & Espírito',     icone: '🧘', primario: 'meditacao' },
  outro:           { nome: 'Outro objetivo',       icone: '🎯', primario: 'proximo-passo' },
};

const PERIODOS = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' };

const ANCORAS_PADRAO = [
  { id: 'acordar', texto: 'acordar e sair da cama',        hora: '06:30', periodo: 'manha' },
  { id: 'cafe',    texto: 'tomar o café da manhã',         hora: '07:00', periodo: 'manha' },
  { id: 'almoco',  texto: 'terminar o almoço',             hora: '12:30', periodo: 'tarde' },
  { id: 'pausa',   texto: 'fazer a pausa da tarde',        hora: '15:30', periodo: 'tarde' },
  { id: 'casa',    texto: 'chegar em casa',                hora: '18:30', periodo: 'noite' },
  { id: 'jantar',  texto: 'jantar',                        hora: '20:00', periodo: 'noite' },
  { id: 'dormir',  texto: 'escovar os dentes à noite',     hora: '22:00', periodo: 'noite' },
];

// Âncoras mais "automáticas" do dia — usadas quando a pessoa esquece a tarefa
const ANCORAS_FORTES = ['acordar', 'cafe', 'dormir', 'almoco'];

const PADROES_TEXTO = {
  identidade: 'age todos os dias em direção aos próprios objetivos',
  gatilho: 'sentir o impulso',
  substituto: 'beber um copo de água, respirar fundo 3 vezes ou caminhar um pouco',
};

const MOTIVOS = {
  tempo:     { nome: 'Não tive tempo',                      icone: '⏰' },
  esqueci:   { nome: 'Esqueci',                             icone: '💭' },
  energia:   { nome: 'Estava sem energia',                  icone: '🔋' },
  dificil:   { nome: 'Achei difícil demais',                icone: '🧗' },
  vontade:   { nome: 'Não tive vontade / resistência',      icone: '🧱' },
  conflito:  { nome: 'Conflitou com outra atividade',       icone: '📅' },
  ambiente:  { nome: 'O ambiente/contexto não ajudou',      icone: '🏠' },
};

const SENTIMENTOS = ['Grato', 'Confiante', 'Calmo', 'Animado', 'Focado', 'Esperançoso',
  'Cansado', 'Ansioso', 'Irritado', 'Triste', 'Desmotivado', 'Sobrecarregado'];

const CELEBRACOES = [
  'Isso! Diga "mandei bem" e sinta por 2 segundos — é assim que o cérebro grava o hábito.',
  'Vitória registrada. Cada ação é um voto para quem você está se tornando.',
  'Feito! A dopamina da conquista reforça o circuito. Sorria de verdade agora.',
  'Mais uma! Pequenas ações repetidas criam grandes mudanças.',
  'Excelente. Você acabou de fortalecer uma nova conexão neural.',
  'Boa! Comemore com um gesto — punho fechado, um "yes!". Celebrar ancora o hábito.',
  'Feito é melhor que perfeito. Você está construindo consistência.',
];

const TEMPLATES = [
  /* ===================== GENÉRICOS (qualquer objetivo) ===================== */
  {
    id: 'proximo-passo', nome: 'Próximo passo focado', tipo: 'meta', areas: ['*'], pilar: 'prod', periodo: 'pico',
    niveis: [
      { t: 'Escreva em uma frase qual é o próximo passo físico e visível para "{meta}".', min: 2 },
      { t: 'Execute por 2 minutos o próximo passo de "{meta}" — só começar já conta.', min: 2 },
      { t: 'Faça 10 minutos focados em "{meta}", com o celular longe.', min: 10 },
      { t: 'Faça um bloco Pomodoro de 25 minutos em "{meta}".', min: 25 },
      { t: 'Faça 2 blocos de 25 min (com 5 min de pausa) em "{meta}".', min: 55 },
    ],
    porque: 'Regra dos 2 minutos + Efeito Zeigarnik: começar cria uma "tarefa aberta" no cérebro que puxa você a continuar. Ter clareza do próximo passo físico elimina a procrastinação causada por ambiguidade.',
  },
  {
    id: 'woop', nome: 'Visualização + plano (WOOP)', tipo: 'meta', areas: ['*'], pilar: 'neuro', periodo: 'manha',
    niveis: [
      { t: 'Feche os olhos por 30s e imagine "{meta}" já realizado. Note uma sensação boa no corpo.', min: 1 },
      { t: 'WOOP rápido (2 min): Desejo → Melhor resultado → Principal obstáculo interno → Plano "Se [obstáculo], então eu [ação]".', min: 2 },
      { t: 'Visualize por 3 min o PROCESSO: você executando as ações de hoje para "{meta}", inclusive superando um obstáculo.', min: 3 },
      { t: 'Escreva seu WOOP completo e um "Se… então…" para os 2 obstáculos mais prováveis de hoje.', min: 5 },
      { t: '5 min de visualização do processo + leitura em voz alta do seu porquê.', min: 5 },
    ],
    porque: 'Contraste mental (Gabriele Oettingen): imaginar o resultado E o obstáculo aumenta a execução, enquanto só fantasiar reduz a energia. Intenções de implementação "se-então" (Peter Gollwitzer) aumentam muito a taxa de ação.',
  },
  {
    id: 'identidade', nome: 'Nova identidade', tipo: 'meta', areas: ['*'], pilar: 'pnl', periodo: 'manha',
    niveis: [
      { t: 'Leia em voz alta: "Eu sou uma pessoa que {identidade}."', min: 1 },
      { t: 'Leia sua frase de identidade e decida uma pequena ação que essa pessoa faria hoje.', min: 1 },
      { t: 'Escreva 1 evidência de hoje que prova que você é alguém que {identidade}.', min: 2 },
      { t: 'Escreva 3 evidências da sua nova identidade e como se sentiu em cada uma.', min: 4 },
      { t: 'Revise a semana: liste as ações que "votaram" na sua nova identidade e ajuste uma.', min: 6 },
    ],
    porque: 'Mudança baseada em identidade (James Clear) e níveis neurológicos (Robert Dilts, PNL): comportamentos coerentes com quem você acredita ser se mantêm sem depender de força de vontade.',
  },
  {
    id: 'ambiente', nome: 'Design do ambiente', tipo: 'meta', areas: ['*'], pilar: 'comp', periodo: 'noite',
    niveis: [
      { t: 'Remova 1 obstáculo físico que atrapalha "{meta}" (ou coloque 1 lembrete visível).', min: 2 },
      { t: 'Deixe pronto agora o material para a próxima ação de "{meta}".', min: 3 },
      { t: 'Torne a ação de "{meta}" 20 segundos mais fácil e a distração 20 segundos mais difícil.', min: 5 },
      { t: 'Reorganize um espaço (mesa, celular, cozinha) pensando em "{meta}".', min: 10 },
      { t: 'Crie um gatilho visual fixo: um lugar/objeto que sempre dispara a ação de "{meta}".', min: 10 },
    ],
    porque: 'O comportamento segue o caminho de menor resistência. A "regra dos 20 segundos" (Shawn Achor) mostra que pequenas fricções mudam escolhas mais do que motivação.',
  },
  {
    id: 'compromisso', nome: 'Compromisso social', tipo: 'meta', areas: ['*'], pilar: 'comp', periodo: 'tarde',
    niveis: [
      { t: 'Escreva "{meta}" num papel e deixe onde você vai ver todos os dias.', min: 1 },
      { t: 'Conte a uma pessoa de confiança o que você vai fazer esta semana por "{meta}".', min: 3 },
      { t: 'Mande para alguém um registro de uma ação que você fez hoje por "{meta}".', min: 2 },
      { t: 'Combine um check-in semanal de 10 min com alguém sobre seu progresso.', min: 5 },
      { t: 'Encontre alguém com objetivo parecido e combinem uma ação juntos.', min: 10 },
    ],
    porque: 'Compromissos públicos e check-ins ativam nosso desejo de consistência (Robert Cialdini) e aumentam a taxa de conclusão de metas.',
  },
  {
    id: 'estudo-meta', nome: 'Modelagem e aprendizado', tipo: 'meta', areas: ['*'], pilar: 'pnl', periodo: 'tarde',
    niveis: [
      { t: 'Leia ou ouça 2 minutos de conteúdo sobre como alcançar "{meta}".', min: 2 },
      { t: 'Aprenda 1 técnica nova (5 min) e anote como aplicá-la amanhã.', min: 5 },
      { t: 'Explique em 3 frases o que aprendeu, como se ensinasse alguém (técnica Feynman).', min: 5 },
      { t: '15 min de estudo + aplicar imediatamente uma ideia em "{meta}".', min: 15 },
      { t: 'Estude ou converse com alguém que já conquistou algo parecido e copie 1 estratégia.', min: 20 },
    ],
    porque: 'Modelagem — replicar as estratégias de quem já conseguiu — é a base da PNL. O cérebro consolida melhor o que é aplicado logo após aprender.',
  },

  /* ===================== SAÚDE ===================== */
  {
    id: 'movimento', nome: 'Movimento diário', tipo: 'meta', areas: ['saude'], pilar: 'habito', periodo: 'manha',
    niveis: [
      { t: 'Calce o tênis e faça 1 minuto de movimento (polichinelos, alongamento ou andar).', min: 1 },
      { t: 'Caminhe ou se movimente por 5 minutos.', min: 5 },
      { t: '10 minutos de caminhada em ritmo firme ou exercícios leves.', min: 10 },
      { t: '20 minutos de exercício (caminhada rápida, treino, bike).', min: 20 },
      { t: '30–40 minutos de treino com intensidade moderada.', min: 35 },
    ],
    porque: 'Exercício libera BDNF (o "fertilizante" dos neurônios), dopamina e endorfinas. Começar com 1 minuto vence a resistência inicial; a consistência cria o hábito, a intensidade vem depois.',
  },
  {
    id: 'agua', nome: 'Hidratação', tipo: 'meta', areas: ['saude'], pilar: 'habito', periodo: 'manha',
    niveis: [
      { t: 'Beba 1 copo de água logo ao acordar.', min: 1 },
      { t: 'Beba 1 copo de água ao acordar e outro no almoço.', min: 1 },
      { t: 'Deixe uma garrafa à vista e beba 1 litro até o fim da tarde.', min: 1 },
      { t: 'Beba 1,5 litro de água ao longo do dia.', min: 2 },
      { t: '2 litros de água + troque 1 bebida açucarada por água.', min: 2 },
    ],
    porque: 'Mesmo uma desidratação leve reduz atenção, humor e energia. É um hábito-âncora fácil que gera uma "vitória rápida" logo cedo.',
  },
  {
    id: 'alimentacao', nome: 'Alimentação consciente', tipo: 'meta', areas: ['saude'], pilar: 'comp', periodo: 'tarde',
    niveis: [
      { t: 'Adicione 1 fruta ou vegetal a uma refeição hoje.', min: 2 },
      { t: 'Coma uma refeição devagar: descanse o talher entre as garfadas.', min: 5 },
      { t: 'Monte metade do prato com vegetais no almoço.', min: 5 },
      { t: 'Planeje as refeições de amanhã (5 min).', min: 5 },
      { t: 'Prepare uma refeição saudável em casa e evite ultraprocessados o dia todo.', min: 30 },
    ],
    porque: 'Adicionar é mais fácil para o cérebro do que proibir (evita a reatância psicológica). Comer devagar dá tempo para os sinais de saciedade chegarem ao cérebro.',
  },
  {
    id: 'sono', nome: 'Ritual de sono', tipo: 'meta', areas: ['saude', 'bemestar'], pilar: 'neuro', periodo: 'noite',
    niveis: [
      { t: 'Coloque o celular longe da cama hoje.', min: 1 },
      { t: 'Desligue as telas 15 minutos antes de dormir.', min: 15 },
      { t: 'Desligue as telas 30 min antes e diminua as luzes da casa.', min: 30 },
      { t: 'Deite no mesmo horário de ontem (±30 min), sem telas 45 min antes.', min: 45 },
      { t: 'Ritual completo: luz baixa, sem telas 60 min antes, leitura leve, mesmo horário.', min: 60 },
    ],
    porque: 'O sono consolida a memória, regula emoções e recarrega o córtex pré-frontal (autocontrole). A luz de telas atrasa a melatonina; horário regular fortalece o ritmo circadiano.',
  },

  /* ===================== FINANÇAS ===================== */
  {
    id: 'gastos', nome: 'Consciência dos gastos', tipo: 'meta', areas: ['financas'], pilar: 'comp', periodo: 'noite',
    niveis: [
      { t: 'Anote 1 gasto que você fez hoje.', min: 1 },
      { t: 'Anote todos os gastos de hoje (app ou papel).', min: 3 },
      { t: 'Classifique os gastos de hoje em "essencial" e "impulso".', min: 5 },
      { t: 'Revise os gastos da semana e identifique 1 vazamento.', min: 10 },
      { t: 'Monte ou atualize o orçamento do mês com limites por categoria.', min: 20 },
    ],
    porque: 'Automonitoramento: só medir um comportamento já o modifica. Tornar o gasto visível ativa o córtex pré-frontal e reduz compras por impulso.',
  },
  {
    id: 'reserva', nome: 'Pague-se primeiro', tipo: 'meta', areas: ['financas'], pilar: 'habito', periodo: 'manha',
    niveis: [
      { t: 'Transfira qualquer valor simbólico (até R$ 1) para uma caixinha de reserva.', min: 1 },
      { t: 'Crie ou renomeie sua caixinha de reserva com o nome do objetivo: "{meta}".', min: 3 },
      { t: 'Transfira um valor pequeno hoje e agende a repetição semanal.', min: 3 },
      { t: 'Automatize: programe uma transferência automática no dia do pagamento.', min: 5 },
      { t: 'Aumente em 1% o valor guardado automaticamente.', min: 5 },
    ],
    porque: 'O cérebro aprende pela repetição, não pelo valor. "Pague-se primeiro" e a automação eliminam a decisão diária (fadiga de decisão).',
  },
  {
    id: 'renda', nome: 'Ação de renda/economia', tipo: 'meta', areas: ['financas', 'carreira'], pilar: 'prod', periodo: 'pico',
    niveis: [
      { t: 'Escreva 1 ideia de como aumentar sua renda ou reduzir um custo.', min: 2 },
      { t: 'Pesquise 10 min sobre uma ideia de renda extra ou economia.', min: 10 },
      { t: 'Cancele, renegocie ou avalie 1 assinatura ou conta.', min: 10 },
      { t: 'Dê 1 passo concreto em uma fonte de renda (mensagem, orçamento, anúncio).', min: 20 },
      { t: 'Bloco de 45 min construindo uma nova fonte de renda.', min: 45 },
    ],
    porque: 'Ação concreta transforma ansiedade financeira em senso de controle, o que reduz o cortisol e melhora a qualidade das decisões.',
  },

  /* ===================== CARREIRA ===================== */
  {
    id: 'prioridade', nome: 'Prioridade do dia', tipo: 'meta', areas: ['carreira', 'outro'], pilar: 'prod', periodo: 'noite',
    niveis: [
      { t: 'Escreva a 1 tarefa mais importante de amanhã.', min: 1 },
      { t: 'Escreva as 3 prioridades de amanhã e marque a principal.', min: 3 },
      { t: 'Bloqueie na agenda 1h para a tarefa mais importante de amanhã.', min: 3 },
      { t: 'Faça a tarefa mais importante antes de abrir e-mail e redes sociais.', min: 30 },
      { t: 'Planejamento semanal (20 min): metas, blocos de foco e o que NÃO fazer.', min: 20 },
    ],
    porque: 'Decidir de véspera poupa força de vontade pela manhã. O princípio de Pareto e o "Eat the frog" colocam sua energia de pico no que gera resultado.',
  },
  {
    id: 'networking', nome: 'Rede de contatos', tipo: 'meta', areas: ['carreira'], pilar: 'comp', periodo: 'tarde',
    niveis: [
      { t: 'Comente algo relevante de um contato profissional.', min: 1 },
      { t: 'Mande 1 mensagem genuína para um contato profissional.', min: 3 },
      { t: 'Ofereça ajuda ou compartilhe algo útil com alguém da sua área.', min: 5 },
      { t: 'Marque um café ou chamada de 15 min com alguém que você admira.', min: 10 },
      { t: 'Apresente duas pessoas que podem se ajudar.', min: 10 },
    ],
    porque: 'Grande parte das oportunidades vem de "laços fracos" (Mark Granovetter). A reciprocidade gera confiança e ativa circuitos de recompensa social.',
  },
  {
    id: 'habilidade', nome: 'Prática deliberada', tipo: 'meta', areas: ['carreira', 'aprendizado'], pilar: 'neuro', periodo: 'pico',
    niveis: [
      { t: 'Escolha a 1 habilidade que mais acelera "{meta}" e anote.', min: 2 },
      { t: 'Estude ou pratique essa habilidade por 5 minutos.', min: 5 },
      { t: '15 min de prática deliberada focada no seu ponto mais fraco.', min: 15 },
      { t: '30 min de prática deliberada com algum tipo de feedback.', min: 30 },
      { t: 'Crie um pequeno projeto usando a habilidade e mostre a alguém.', min: 45 },
    ],
    porque: 'Prática deliberada (Anders Ericsson): foco no ponto fraco + feedback fortalece e mieliniza os circuitos neurais usados.',
  },

  /* ===================== APRENDIZADO ===================== */
  {
    id: 'leitura', nome: 'Leitura diária', tipo: 'meta', areas: ['aprendizado'], pilar: 'habito', periodo: 'noite',
    niveis: [
      { t: 'Leia 1 página.', min: 2 },
      { t: 'Leia por 5 minutos.', min: 5 },
      { t: 'Leia 15 minutos e sublinhe 1 ideia.', min: 15 },
      { t: 'Leia 25 minutos e escreva um resumo de 3 linhas.', min: 25 },
      { t: 'Leia 40 minutos e transforme 1 ideia em ação.', min: 40 },
    ],
    porque: 'Ler uma página parece pouco, mas mantém a identidade de leitor ativa. Hábitos sobrevivem pela frequência, não pela duração.',
  },
  {
    id: 'recordacao', nome: 'Recordação ativa', tipo: 'meta', areas: ['aprendizado'], pilar: 'neuro', periodo: 'manha',
    niveis: [
      { t: 'Sem olhar, escreva 1 coisa que você aprendeu ontem.', min: 1 },
      { t: 'Faça 3 perguntas a si mesmo sobre o que estudou e responda sem consultar.', min: 3 },
      { t: 'Revise com flashcards por 10 minutos.', min: 10 },
      { t: 'Explique o conteúdo em voz alta como se ensinasse alguém.', min: 10 },
      { t: 'Revisão espaçada: revise o conteúdo de 1, 3 e 7 dias atrás.', min: 20 },
    ],
    porque: 'Prática de recuperação e repetição espaçada são as técnicas de estudo com mais evidência científica: puxar a informação da memória fortalece a conexão muito mais do que reler.',
  },

  /* ===================== RELACIONAMENTOS ===================== */
  {
    id: 'conexao', nome: 'Conexão diária', tipo: 'meta', areas: ['relacionamentos'], pilar: 'comp', periodo: 'tarde',
    niveis: [
      { t: 'Mande uma mensagem de carinho para alguém importante.', min: 1 },
      { t: 'Faça um elogio específico e sincero a alguém.', min: 2 },
      { t: 'Converse 10 min sem celular com alguém querido.', min: 10 },
      { t: 'Planeje um momento de qualidade com alguém (encontro, passeio).', min: 10 },
      { t: 'Tenha uma conversa profunda: pergunte sobre sonhos e desafios da pessoa.', min: 30 },
    ],
    porque: 'O Estudo de Harvard sobre Desenvolvimento Adulto (mais de 80 anos) mostra que a qualidade dos relacionamentos é um dos maiores preditores de felicidade e saúde. Contato positivo libera ocitocina.',
  },
  {
    id: 'escuta', nome: 'Rapport e escuta', tipo: 'meta', areas: ['relacionamentos', 'carreira'], pilar: 'pnl', periodo: 'tarde',
    niveis: [
      { t: 'Numa conversa hoje, faça 1 pergunta a mais antes de falar de você.', min: 1 },
      { t: 'Pratique o espelhamento: repita com suas palavras o que a pessoa disse.', min: 2 },
      { t: 'Observe o ritmo e o tom de alguém e acompanhe-o sutilmente (rapport).', min: 3 },
      { t: 'Numa conversa difícil, use: "Eu sinto… quando… e preciso…" (CNV).', min: 5 },
      { t: 'Peça feedback sincero a alguém próximo e apenas agradeça, sem se defender.', min: 10 },
    ],
    porque: 'Rapport e espelhamento (PNL) e a Comunicação Não-Violenta (Marshall Rosenberg) aumentam a sensação de ser compreendido — a base da confiança.',
  },

  /* ===================== MENTE & ESPÍRITO ===================== */
  {
    id: 'meditacao', nome: 'Meditação', tipo: 'meta', areas: ['bemestar'], pilar: 'neuro', periodo: 'manha',
    niveis: [
      { t: 'Faça 3 respirações conscientes, prestando atenção só no ar.', min: 1 },
      { t: '2 minutos de meditação focada na respiração.', min: 2 },
      { t: '5 minutos de meditação (volte à respiração sempre que se distrair).', min: 5 },
      { t: '10 minutos de meditação ou body scan.', min: 10 },
      { t: '20 minutos de meditação.', min: 20 },
    ],
    porque: 'Meditação regular reduz a reatividade da amígdala e fortalece o córtex pré-frontal. Cada vez que você nota a distração e volta, é uma "repetição" de academia para o cérebro.',
  },
  {
    id: 'diario-escrita', nome: 'Escrita reflexiva', tipo: 'meta', areas: ['bemestar'], pilar: 'neuro', periodo: 'noite',
    niveis: [
      { t: 'Escreva 1 frase sobre como você está se sentindo.', min: 1 },
      { t: 'Escreva 3 linhas: o que aconteceu, o que senti, o que aprendi.', min: 3 },
      { t: 'Escreva 5 min livremente, sem censura, sobre o que ocupa sua mente.', min: 5 },
      { t: 'Escrita expressiva de 15 min sobre algo que te incomoda.', min: 15 },
      { t: 'Escreva uma carta do seu "eu do futuro" que já realizou seus objetivos.', min: 20 },
    ],
    porque: 'A escrita expressiva (James Pennebaker) organiza emoções, reduz a ruminação e libera memória de trabalho.',
  },
  {
    id: 'proposito', nome: 'Propósito e sentido', tipo: 'meta', areas: ['bemestar'], pilar: 'energia', periodo: 'manha',
    niveis: [
      { t: 'Pergunte-se: "O que daria sentido ao meu dia hoje?" e anote a resposta.', min: 1 },
      { t: 'Escolha 1 valor (ex.: generosidade, coragem) para guiar o dia.', min: 2 },
      { t: 'Faça um ato de gentileza anônimo.', min: 5 },
      { t: '10 min em silêncio, oração ou contemplação na natureza.', min: 10 },
      { t: 'Escreva sua declaração de propósito e o que ela pede de você esta semana.', min: 20 },
    ],
    porque: 'Ter senso de propósito está associado a mais resiliência, saúde e longevidade. Atos de gentileza elevam o humor de quem faz (efeito "helper\'s high").',
  },

  /* ===================== ESTADO / ENERGIA (diários) ===================== */
  {
    id: 'respiracao', nome: 'Respiração coerente', tipo: 'estado', areas: [], pilar: 'energia', periodo: 'manha',
    niveis: [
      { t: '3 respirações lentas: inspire em 4s, expire em 6s.', min: 1 },
      { t: '1 minuto de respiração: inspire em 4s, expire em 6s.', min: 1 },
      { t: '3 minutos de respiração coerente (5s inspirando, 5s expirando).', min: 3 },
      { t: '5 min de respiração coerente sentindo gratidão na região do peito.', min: 5 },
      { t: '10 min de coerência cardíaca, duas vezes no dia.', min: 10 },
    ],
    porque: 'Expirar mais longo ativa o nervo vago (sistema parassimpático) e aumenta a variabilidade da frequência cardíaca (VFC) — o marcador mais concreto da sua "vibração": um estado calmo, focado e coerente.',
  },
  {
    id: 'gratidao', nome: 'Gratidão', tipo: 'estado', areas: [], pilar: 'energia', periodo: 'manha',
    niveis: [
      { t: 'Pense em 1 coisa pela qual você é grato agora e sinta isso por 10 segundos.', min: 1 },
      { t: 'Escreva 3 gratidões específicas de ontem.', min: 2 },
      { t: 'Escreva 3 gratidões e POR QUE cada uma aconteceu.', min: 3 },
      { t: 'Envie uma mensagem de agradecimento a alguém.', min: 3 },
      { t: 'Escreva uma carta de gratidão (e, se possível, leia para a pessoa).', min: 15 },
    ],
    porque: 'O cérebro tem viés de negatividade. A gratidão treina a atenção a perceber o positivo e está associada a mais bem-estar, sono melhor e menos ansiedade.',
  },
  {
    id: 'ancora', nome: 'Âncora de confiança', tipo: 'estado', areas: [], pilar: 'pnl', periodo: 'manha',
    niveis: [
      { t: 'Lembre de um momento em que se sentiu confiante. Reviva-o por 20 segundos.', min: 1 },
      { t: 'Reviva um momento de confiança e, no pico da sensação, aperte polegar e indicador (âncora).', min: 2 },
      { t: 'Repita a âncora 5 vezes com momentos diferentes de força e determinação.', min: 4 },
      { t: 'Dispare sua âncora antes de uma tarefa desafiadora de hoje.', min: 2 },
      { t: 'Empilhe âncoras: confiança + calma + energia no mesmo gesto.', min: 5 },
    ],
    porque: 'Ancoragem (PNL) usa condicionamento associativo: emparelhar um estado emocional intenso com um gesto cria um atalho para acessar esse estado quando você precisar.',
  },
  {
    id: 'luz', nome: 'Luz da manhã', tipo: 'estado', areas: [], pilar: 'neuro', periodo: 'manha',
    niveis: [
      { t: 'Abra a janela e olhe para a luz do dia por 1 minuto ao acordar.', min: 1 },
      { t: '2 a 5 minutos de luz natural pela manhã (sem óculos escuros).', min: 5 },
      { t: '10 minutos de luz natural pela manhã, se possível caminhando.', min: 10 },
      { t: '10 min de luz pela manhã + 5 min de luz no fim da tarde.', min: 15 },
      { t: 'Caminhada matinal de 20 min ao ar livre.', min: 20 },
    ],
    porque: 'A luz da manhã sincroniza o relógio circadiano: melhora energia e humor durante o dia e a qualidade do sono à noite.',
  },
  {
    id: 'reenquadre', nome: 'Reenquadrar pensamentos', tipo: 'estado', areas: [], pilar: 'pnl', periodo: 'tarde',
    niveis: [
      { t: 'Note 1 pensamento negativo hoje e diga: "Estou tendo o pensamento de que…".', min: 1 },
      { t: 'Pergunte a um pensamento limitante: "Isso é 100% verdade? Que prova eu tenho?"', min: 2 },
      { t: 'Reescreva 1 pensamento limitante numa versão realista e útil (use o Diário).', min: 3 },
      { t: 'Reenquadre um problema: "Para que isso pode me servir? O que posso aprender?"', min: 4 },
      { t: 'Swish (PNL): troque a imagem mental do padrão antigo pela imagem de quem você quer ser, 5 vezes rápido.', min: 5 },
    ],
    porque: 'Desfusão cognitiva (ACT) e reestruturação cognitiva (TCC) reduzem o peso emocional dos pensamentos. O reenquadramento (PNL) muda o significado — e o significado muda a emoção.',
  },
  {
    id: 'postura', nome: 'Corpo e estado', tipo: 'estado', areas: [], pilar: 'energia', periodo: 'tarde',
    niveis: [
      { t: 'Levante, abra o peito e alongue os braços por 30 segundos.', min: 1 },
      { t: 'Sorria por 30s e coloque uma música que eleva seu estado.', min: 2 },
      { t: '2 min de movimento intenso (pular, dançar) para mudar o estado.', min: 2 },
      { t: 'Pausa ativa de 5 min longe das telas, caminhando.', min: 5 },
      { t: 'Banho frio de 30–60 segundos (ou finalize o banho com água fria).', min: 2 },
    ],
    porque: 'Fisiologia muda emoção: movimento, respiração e postura alteram neurotransmissores (dopamina, noradrenalina) em minutos. Mude o corpo e o estado acompanha.',
  },

  /* ===================== PADRÕES / VÍCIOS ===================== */
  {
    id: 'nomear', nome: 'Observar o impulso', tipo: 'padrao', areas: [], pilar: 'neuro', periodo: 'tarde',
    niveis: [
      { t: 'Quando surgir vontade de {padrao}, apenas nomeie: "isso é um impulso, ele passa".', min: 1 },
      { t: 'Registre no app (aba Padrões) cada vez que sentir vontade de {padrao}, mesmo se ceder.', min: 1 },
      { t: 'Ao sentir o impulso de {padrao}, note onde ele aparece no corpo e respire 3 vezes.', min: 1 },
      { t: 'Identifique o sentimento por trás do impulso de {padrao} (tédio? ansiedade? cansaço?).', min: 2 },
      { t: 'No fim do dia, revise: quando, onde e com quem o impulso de {padrao} surgiu.', min: 3 },
    ],
    porque: 'Rotular a emoção (affect labeling) reduz a ativação da amígdala. Você sai do piloto automático e cria um espaço entre impulso e ação.',
  },
  {
    id: 'adiar', nome: 'Surfar o impulso', tipo: 'padrao', areas: [], pilar: 'habito', periodo: 'tarde',
    niveis: [
      { t: 'Quando vier a vontade de {padrao}, espere 1 minuto antes de decidir.', min: 1 },
      { t: 'Espere 5 minutos (surfando o impulso) antes de decidir sobre {padrao}.', min: 5 },
      { t: 'Espere 10 minutos e ocupe as mãos com outra coisa nesse tempo.', min: 10 },
      { t: 'Espere 20 minutos e anote se a vontade de {padrao} diminuiu.', min: 20 },
      { t: 'Escolha 1 período do dia totalmente livre de {padrao}.', min: 1 },
    ],
    porque: 'Impulsos sobem e descem como ondas, geralmente em poucos minutos (urge surfing, Alan Marlatt). Cada vez que você espera sem ceder, o circuito do hábito enfraquece.',
  },
  {
    id: 'substituir', nome: 'Substituir a rotina', tipo: 'padrao', areas: [], pilar: 'habito', periodo: 'tarde',
    niveis: [
      { t: 'Quando {gatilho}, troque {padrao} por {substituto} — só por 1 minuto.', min: 1 },
      { t: 'Quando {gatilho}, faça {substituto} por 5 minutos antes de qualquer decisão.', min: 5 },
      { t: 'Faça {substituto} sempre que {gatilho} — sem exceção hoje.', min: 5 },
      { t: 'Deixe tudo preparado para {substituto} estar à mão quando {gatilho}.', min: 5 },
      { t: 'Repita a substituição e avalie se a recompensa é parecida. Ajuste o substituto se não for.', min: 5 },
    ],
    porque: 'O loop do hábito (Charles Duhigg): gatilho → rotina → recompensa. Um hábito não se apaga — se substitui a rotina mantendo o gatilho e uma recompensa parecida.',
  },
  {
    id: 'friccao', nome: 'Aumentar a fricção', tipo: 'padrao', areas: [], pilar: 'comp', periodo: 'noite',
    niveis: [
      { t: 'Torne {padrao} 20 segundos mais difícil (esconder, desconectar, tirar da vista).', min: 2 },
      { t: 'Remova um gatilho do seu ambiente relacionado a {padrao}.', min: 3 },
      { t: 'Crie uma barreira real para {padrao}: senha, outro cômodo, não ter em casa.', min: 5 },
      { t: 'Avise alguém de confiança de que você está reduzindo {padrao}.', min: 3 },
      { t: 'Reorganize a rotina para evitar a situação de maior risco de {padrao}.', min: 10 },
    ],
    porque: 'Quanto mais fácil, mais automático. Adicionar fricção ao comportamento indesejado é mais eficaz do que contar só com força de vontade, que se esgota ao longo do dia.',
  },
];

const TPL = Object.fromEntries(TEMPLATES.map(t => [t.id, t]));

// Perguntas para reenquadrar pensamentos (TCC + Meta-modelo da PNL)
const PERGUNTAS_REENQUADRE = [
  'Que evidências eu tenho de que isso é verdade? E contra?',
  'O que eu diria a um amigo que pensasse isso?',
  '"Sempre? Nunca? Todo mundo?" — é mesmo assim, ou estou generalizando?',
  'Qual é uma forma mais realista e útil de ver isso?',
  'Para que essa situação pode me servir? O que posso aprender?',
];

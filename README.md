# Caminho do Sucesso

App para alcançar objetivos através de micro-ações diárias que se adaptam a você.

## Como usar

- **No computador:** dê dois cliques em `index.html`.
- **Instalável/offline (PWA):** sirva a pasta por HTTP, por exemplo `npx serve .`, e abra o endereço mostrado.
  Para usar no celular, publique a pasta em qualquer hospedagem estática (Netlify, GitHub Pages, Vercel)
  e use "Adicionar à tela inicial".

Os dados ficam salvos apenas no navegador do dispositivo (localStorage). Use **Ajustes → Exportar backup**.

## Estrutura

- `js/biblioteca.js` — pilares, áreas, âncoras de rotina e os modelos de tarefa (5 níveis cada)
- `js/motor.js` — geração do plano diário, subida/descida de nível, adaptação por motivo de falha, insights
- `js/app.js` — interface (Hoje, Objetivos, Padrões, Diário, Progresso, Ajustes)
- `sw.js`, `manifest.webmanifest`, `icon.svg` — funcionamento offline e instalação

## Regras de adaptação

| Situação | O que o app faz |
|---|---|
| 3 conclusões seguidas | sobe 1 nível |
| Não tive tempo | desce 1 nível (ou muda o horário se já está no mínimo) |
| Esqueci | liga a tarefa a uma âncora forte da rotina e ativa lembrete |
| Sem energia | move para o seu pico de energia e desce 1 nível |
| Difícil demais | desce 2 níveis |
| Sem vontade | desce 1 nível e agenda um exercício de reenquadre para amanhã |
| Conflitou | move para outro momento da rotina |
| Ambiente | agenda uma tarefa de design de ambiente para amanhã |
| 2 dias sem registrar | desce 1 nível |
| 3 falhas no nível mínimo | troca o hábito principal do objetivo |
| Execução < 40% na semana ou 3+ dias ausente | plano do dia em "modo leve" |
| Execução ≥ 85% | mais desafio (orçamento de tempo +25%) |

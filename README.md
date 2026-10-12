# Caminho do Sucesso

App para alcançar objetivos através de micro-ações diárias que se adaptam a você.

## Como usar

- **No computador:** dê dois cliques em `index.html`.
- **Instalável/offline (PWA):** sirva a pasta por HTTP, por exemplo `npx serve .`, e abra o endereço mostrado.
  Para usar no celular, publique a pasta em qualquer hospedagem estática (Netlify, GitHub Pages, Vercel)
  e use "Adicionar à tela inicial".

Os dados ficam salvos no navegador (localStorage) e, com login Google, também no Firebase/Firestore,
sincronizando entre aparelhos. Use também **Ajustes → Exportar backup**.

## Firebase (login + nuvem)

Projeto: `caminhodosucesso-6f506` (configuração em `js/nuvem.js`; o SDK é carregado do CDN oficial, sem build).

Configuração única no [console do Firebase](https://console.firebase.google.com/project/caminhodosucesso-6f506):

1. **Authentication → Vamos começar → Método de login → Google → Ativar.**
2. **Firestore Database → Regras:** cole o conteúdo de `firestore.rules` e clique em **Publicar**.
3. **Authentication → Configurações → Domínios autorizados:** `localhost` e os domínios do Firebase Hosting já vêm
   liberados; se usar GitHub Pages, adicione `marcianofiscal85.github.io`.

Publicar no Firebase Hosting (opcional, gera `https://caminhodosucesso-6f506.web.app`):

```
npm install -g firebase-tools
firebase login
firebase deploy
```

`firebase deploy` publica o site e as regras do Firestore. Login com Google não funciona abrindo o
`index.html` direto do disco (file://) — use o endereço publicado ou `npx serve .` (localhost).

Estrutura no Firestore: `usuarios/{uid}` (perfil, objetivos, padrões, níveis) e `usuarios/{uid}/dias/{data}`
(plano e diário de cada dia). As regras garantem que cada pessoa só acessa os próprios dados.

## Estrutura

- `js/biblioteca.js` — pilares, áreas, âncoras de rotina e os modelos de tarefa (5 níveis cada)
- `js/motor.js` — geração do plano diário, subida/descida de nível, adaptação por motivo de falha, insights
- `js/app.js` — interface (Hoje, Objetivos, Padrões, Diário, Progresso, Ajustes)
- `js/nuvem.js` — login Google e sincronização com o Firestore
- `firestore.rules`, `firebase.json`, `.firebaserc` — regras de segurança e Firebase Hosting
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

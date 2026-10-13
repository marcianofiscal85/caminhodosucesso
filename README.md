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

## Acesso por convite

O app só pode ser usado por quem tem convite. A proteção está nas **regras do Firestore** (servidor),
não apenas na interface — mesmo alterando o código do app, ninguém lê ou grava dados sem convite válido.

- **Administrador:** `marcianofiscal85@gmail.com` (definido em `ehAdmin()` no `firestore.rules` e em
  `ADMIN_EMAIL` no `js/nuvem.js` — altere os dois se mudar). Só o admin vê o painel 🛡️ **Convites**.
- **Convite** (`convites/{código}`): vinculado a um e-mail, com validade, uso único. Só o admin cria,
  lista, cancela e exclui. O convidado só consegue ler o convite emitido para o próprio e-mail.
- **Cadastro:** na tela inicial, "Criar conta" pede primeiro o código (ou abre pelo link `?convite=`).
  O app consulta `validacao/{código}` (público: só validade, se está ativo e o e-mail mascarado) e então
  a pessoa se cadastra com **Google** ou **e-mail e senha**. Contas por e-mail e senha precisam confirmar
  o e-mail pelo link enviado antes de ativar o convite. "Entrar" aceita Google ou e-mail/senha, com
  "Esqueci minha senha".
- **Resgate:** em uma única operação atômica, as regras exigem: mesmo e-mail (verificado), convite não
  usado, não cancelado e dentro da validade — e marcam o convite como usado.
- **E-mail errado:** se a pessoa usa um código válido com outro e-mail, a tentativa fica registrada em
  `tentativas` e aparece no painel do admin, que pode **liberar o convite para o e-mail usado** (a pessoa
  tenta de novo com o mesmo código). Convites pendentes também têm **Reenviar** (copiar, compartilhar,
  e-mail) e **Alterar e-mail**; expirados podem ser **renovados**.
- **Membros** (`membros/{uid}`): quem resgatou um convite. O admin pode **remover o acesso** a qualquer
  momento; a pessoa é bloqueada na hora e só volta com um novo convite.
- **Privacidade:** cada pessoa acessa apenas `usuarios/{seu uid}`. Nem o administrador consegue ler os
  dados dos convidados.

Observação: qualquer pessoa ainda consegue *fazer login* com Google (o Firebase Authentication registra a
conta), mas sem convite ela fica parada na tela de convite e não tem acesso a nenhum dado.

Testes das regras (emulador): 66 cenários cobrindo geração, validação pública, resgate, reuso, expiração,
cancelamento, e-mail errado/liberação, contas sem e-mail confirmado,
isolamento de dados e remoção de acesso.

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

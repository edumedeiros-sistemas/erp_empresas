# Aura Casa ERP

ERP web responsivo (desktop e telemóvel) para gestão de vendas, clientes, produtos, stock, financeiro e resumo. Dados em **Firebase** (Firestore + Authentication + Hosting). O modelo de negócio segue o Excel em `Documents/Aura Casa.xlsx`.

## Estrutura

- `apps/web` — aplicação React (Vite + TypeScript + Tailwind CSS v4)
- `firebase` — regras e índices Firestore, configuração Hosting
- `scripts/import-excel` — importação do Excel para o Firestore (Admin SDK)

## Pré-requisitos

- Node.js 20+
- Conta [Firebase](https://console.firebase.google.com/) com projeto criado (Authentication com Email/Password, Firestore, Hosting opcional)

## Configuração da app web

1. Em `apps/web`, copie `.env.example` para `.env` e preencha com as chaves da consola Firebase (Project settings → Your apps → Web app).

```bash
cd apps/web
cp .env.example .env
npm install
npm run dev
```

2. Publique as regras Firestore:

```bash
npm install -g firebase-tools
firebase login
firebase use --add   # escolha o projeto
firebase deploy --only firestore:rules,firestore:indexes
```

## Criar organização e utilizador

1. Registe-se na app com email e palavra-passe.
2. Em **Organizações**, crie uma empresa; fica como `owner`.
3. Convites adicionais: um administrador pode criar o documento `members/{uid}` na Firestore (consola) ou usar o fluxo futuro com Cloud Functions. Para desenvolvimento, o segundo utilizador regista-se e um `owner` pode adicionar manualmente o membro na subcoleção com o mesmo `uid` do Auth.

## Importar o Excel

1. Obtenha uma chave de conta de serviço (Firebase Console → Project settings → Service accounts → Generate new private key). **Não commite** este JSON.
2. Configure `scripts/import-excel` (ver README dentro dessa pasta) e execute o import indicando o ficheiro e o `orgId`.

## Build de produção

```bash
cd apps/web
npm run build
```

O output fica em `apps/web/dist`. Configure o Hosting do Firebase para usar esse diretório (`firebase.json` já aponta para `apps/web/dist`).

## GitHub

```bash
git init
git add .
git commit -m "Initial Aura Casa ERP"
git remote add origin https://github.com/SEU_USUARIO/aura-casa-erp.git
git push -u origin main
```

Nunca commite `.env`, chaves ou `serviceAccount*.json`.

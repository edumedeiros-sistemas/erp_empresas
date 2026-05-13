# Importar Excel → Firestore

## Opção Node.js (mesmo padrão da documentação Firebase Admin)

```powershell
cd scripts\import-excel
npm install
node importClients.cjs --credentials "C:\caminho\para\serviceAccountKey.json" --excel "..\..\Documents\Aura Casa.xlsx" --org-id "SEU_ORG_ID"
```

No código é o equivalente a:

```js
const admin = require('firebase-admin')
const serviceAccount = require('./serviceAccountKey.json') // ou JSON.parse(fs.readFileSync(...))

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})
```

O script `importClients.cjs` lê o JSON do caminho que passar em `--credentials` e importa só a folha **Clientes**.

---

## Opção Python

1. Crie uma conta de serviço no Firebase Console (Definições do projeto → Contas de serviço → Gerar nova chave privada). Guarde o JSON **fora** do repositório.

2. Instale dependências (Python 3.10+):

```bash
cd scripts/import-excel
pip install -r requirements.txt
```

3. Autenticação (escolha **uma** opção):

**Opção A — argumento `--credentials` (PowerShell)**

```powershell
cd scripts\import-excel
pip install -r requirements.txt
python import_excel.py --credentials "C:\caminho\para\serviceAccount.json" --excel "..\..\Documents\Aura Casa.xlsx" --org-id "SEU_ORG_ID"

**Só clientes** (folha `Clientes` da planilha):

```powershell
python import_excel.py --clients-only --credentials "C:\caminho\para\serviceAccount.json" --excel "..\..\Documents\Aura Casa.xlsx" --org-id "SEU_ORG_ID"
```
```

**Opção B — variável de ambiente**

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\caminho\para\serviceAccount.json"
python import_excel.py --excel "..\..\Documents\Aura Casa.xlsx" --org-id "SEU_ORG_ID"
```

4. Obter o **`orgId`**: Firebase Console → Firestore → coleção `organizations` → ID do documento da loja que criaste na app (não inventes um novo; deve existir esse documento).

O `orgId` é o ID do documento em `organizations` (consola Firebase → Firestore).

O script importa: **Config** (settings), **Clientes**, **Produtos**, **Entradas** (movimentos + stock), **Financeiro** e **Vendas** (agrupando linhas como no Excel). Atualiza também o documento `meta/dashboard` com totais aproximados.

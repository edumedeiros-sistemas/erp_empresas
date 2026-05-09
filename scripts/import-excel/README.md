# Importar Excel → Firestore

1. Crie uma conta de serviço no Firebase Console (Definições do projeto → Contas de serviço → Gerar nova chave privada). Guarde o JSON **fora** do repositório.

2. Instale dependências (Python 3.10+):

```bash
cd scripts/import-excel
pip install -r requirements.txt
```

3. Defina a variável de ambiente com o caminho para o JSON:

**Windows PowerShell**

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\caminho\para\serviceAccount.json"
```

4. Execute (ajuste o caminho do Excel e o `orgId` da sua organização na Firestore):

```bash
python import_excel.py --excel "../../Documents/Aura Casa.xlsx" --org-id "SEU_ORG_ID"
```

O `orgId` é o ID do documento em `organizations` (consola Firebase → Firestore).

O script importa: **Config** (settings), **Clientes**, **Produtos**, **Entradas** (movimentos + stock), **Financeiro** e **Vendas** (agrupando linhas como no Excel). Atualiza também o documento `meta/dashboard` com totais aproximados.

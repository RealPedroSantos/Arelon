# Arelon — Tizen TV Development & Production Workflow

Este guia descreve o fluxo de trabalho moderno e de alta performance adotado para desenvolver, testar e publicar o aplicativo **Arelon** na **Samsung App Store** para TVs rodando Tizen 6.5+ (como a Q65B).

---

## 🚀 1. Desenvolvimento Diário e Validação na TV Física (Modo Live / HTTP)

Para evitar restrições de CORS locais sob o protocolo `file://` e ter a maior agilidade possível no dia a dia, usamos o **Modo Live**. Ele roda o código diretamente na sua TV física de testes, servido via rede local a partir do seu Mac.

### Como rodar:

1. **Inicie o servidor de desenvolvimento local no seu Mac:**
   ```bash
   npm run dev
   ```
   *Isso sobe o frontend React (Vite na porta 5175), o backend de configuração compartilhada e o proxy Xtream.*

2. **Em outro terminal, envie o app para a TV física:**
   ```bash
   npm run deploy:tv-live
   ```
   *Este script detecta automaticamente o IP do seu Mac na rede local, gera a casca Tizen e faz o deploy direto para a TV física.*

   Se a TV estiver em outro IP, informe explicitamente:
   ```bash
   VETRAIO_TV_HOST=IP_DA_TV npm run deploy:tv-live
   ```

### Vantagens:
*   ⚡ **Hot-Reload (Atualização em Tempo Real):** Qualquer modificação que você salvar no código do Mac é atualizada na TV física instantaneamente.
*   🧭 **API sem `localhost` na TV:** O app chama `/api/xtream` no mesmo endereço do Vite (`http://IP_DO_MAC:5175`), e o Vite repassa para o proxy local. Assim a TV não depende de `api.arelon.com.br` durante os testes.
*   🛠️ **Depuração Completa:** Abra o **Google Chrome** no seu Mac e acesse `http://localhost:9222` ou `http://IP_DA_TV:9222` para abrir o **Chrome DevTools** completo da TV e debugar o console e requisições em tempo real.

---

## 📦 2. Preparação para Publicação na Samsung Store (Hosted App / HTTPS)

Para a publicação na loja oficial da Samsung (Samsung Seller Office), utilizamos o modelo de **Hosted App**.

Nesse modelo, o pacote `.wgt` enviado para a Samsung contém apenas a configuração e os ícones do aplicativo, enquanto a tela e o código do React são carregados de forma segura a partir do seu servidor de produção HTTPS.

### Como gerar o pacote da loja (.wgt):

1. **Defina a URL de produção final do seu site hospedado:**
   Defina a variável `VITE_TV_PRODUCTION_URL` no seu arquivo `.env` ou temporariamente no terminal:
   ```bash
   VITE_TV_PRODUCTION_URL="https://arelon-tv.web.app" npm run package:tizen-hosted
   ```

2. **O comando gera o arquivo:**
   `build/packages/arelon-hosted-unsigned.wgt` (um arquivo ultra-leve de poucos kilobytes).

3. **Próximo passo (Assinatura e Envio):**
   *   Abra o **Tizen Studio** ou utilize a ferramenta de linha de comando para assinar o arquivo `arelon-hosted-unsigned.wgt` com o seu **Certificado Samsung**.
   *   Faça o upload do pacote assinado no portal do **Samsung Seller Office**.

### Vantagens do Hosted App na Loja:
*   🔄 **Atualização sem burocracia:** Quando você quiser corrigir um bug ou adicionar recursos, você atualiza o seu servidor web de produção (ex: Vercel, Netlify ou Firebase). **Todos os clientes recebem a atualização instantaneamente**, sem que você precise submeter um novo pacote para avaliação da Samsung (que demora semanas para aprovar).
*   🔒 **CORS e Módulos ES 100% Funcionais:** Como o app é servido sob protocolo seguro `https://`, todas as restrições locais de CORS do protocolo `file://` da TV desaparecem!

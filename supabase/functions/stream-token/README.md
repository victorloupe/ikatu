# Edge Function: `stream-token`

Gera o token do **GetStream Chat** para o usuário logado. O *API Secret* do Stream
fica somente aqui (no servidor) — nunca vai para o cliente.

## 1. Pré-requisitos (uma vez só)

Instale a CLI do Supabase e faça login:

```bash
npm install -g supabase
supabase login
supabase link --project-ref dogyxhfoopiefujyqqyq
```

## 2. Configurar os secrets do Stream

Pegue a **API Key** e o **API Secret** no dashboard do GetStream
(app de Chat → "App Access Keys") e rode:

```bash
supabase secrets set STREAM_API_KEY=SUA_API_KEY STREAM_API_SECRET=SEU_API_SECRET
```

> `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já são injetados
> automaticamente pelo Supabase — não precisa configurar.

## 3. Deploy

```bash
supabase functions deploy stream-token
```

Pronto. O endpoint fica em:

```
https://dogyxhfoopiefujyqqyq.supabase.co/functions/v1/stream-token
```

O `chat.js` chama esse endpoint enviando o token do usuário logado e recebe de
volta `{ token, apiKey, userId }` para conectar ao Stream.

## Como testar

Logue no sistema, abra o **Chat** e veja o console do navegador. Se aparecer
"Stream conectado", está tudo certo. Erros comuns:

- **401 Usuário inválido** → o usuário não está logado / token expirado.
- **500 Variáveis ausentes** → faltou rodar `supabase secrets set`.
- **CORS** → confirme que o deploy foi feito (a função já trata CORS).

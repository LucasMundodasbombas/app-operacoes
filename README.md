# App Operações · Mundo das Bombas

Aplicativo de celular (PWA) com duas áreas:

- **Veículos:** entregas do dia (quem foi, onde e com qual veículo), abastecimento e gastos, motoristas, veículos e relatório mensal.
- **Estoque:** registro de saída com foto (o que é, NF, pedido e cliente) e histórico por dia.

Cada funcionário entra com usuário e senha criados pelo gerente. Todos podem lançar na sua área. **Só o gerente altera ou exclui**, e essa trava fica no banco de dados.

| Função | O que vê e faz |
|---|---|
| Gerente | Tudo, inclusive alterar, excluir, criar logins e trocar senhas |
| Motorista | Veículos: lança entregas e gastos |
| Estoque | Estoque: registra saídas e consulta o histórico |

## Como colocar no ar (uma vez só)

1. **Criar o banco:** entre em https://supabase.com, crie um projeto chamado `operacoes-mdb` (região São Paulo).
2. **Criar as tabelas:** no projeto, abra *SQL Editor › New query*, cole todo o arquivo `supabase/schema.sql` e clique em *Run*.
3. **Ajustar o login:** em *Authentication › Sign In / Providers › Email*:
   - desligue **Confirm email**;
   - deixe ligado **Allow new users to sign up** (quem se cadastrar sozinho não acessa nada, porque só o gerente dá a função);
   - senha mínima: 6 caracteres.
4. **Ligar o app ao banco:** em *Project Settings › API*, copie o **Project URL** e a chave **anon / publishable** e cole em `config.js`. Nunca use a chave `service_role` / `secret`.
5. **Publicar:** no GitHub, em *Settings › Pages*, escolha *Deploy from a branch*, `main`, pasta `/ (root)`. O endereço fica parecido com `https://lucasmundodasbombas.github.io/app-operacoes/`.
6. **Primeiro acesso:** abra o endereço. Como ainda não há gerente, aparece a tela "Primeiro acesso": crie o seu login de gerente.
7. **Criar os logins da equipe:** na aba *Equipe*, crie usuário, senha e função de cada funcionário e mande o link junto.

## Instalar no celular

- **Android (Chrome):** abra o link, toque nos três pontinhos › *Adicionar à tela inicial* (ou *Instalar app*).
- **iPhone (Safari):** abra o link, toque em *Compartilhar* › *Adicionar à Tela de Início*.

## Bom saber

- Sem `config.js` preenchido, o app abre em **modo demonstração**, com dados salvos só naquele aparelho.
- As fotos ficam numa pasta privada do Supabase; só quem tem login ativo consegue abrir.
- Para tirar alguém do acesso, o gerente desativa o login na aba *Equipe*.
- Veículos e motoristas não são apagados, só desativados, para o relatório antigo continuar certo.

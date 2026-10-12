# Mapa de Mesas

Ferramenta gratuita para organizar os convidados de um casamento nas mesas do salão — por cima da planta do local, com contagem de lugares, crianças, confirmações e listas prontas para o cerimonial.

Funciona direto no navegador, também sem internet. **Os dados ficam só no seu navegador**: nada é enviado para servidor nenhum.

## O que dá para fazer

- **Planta do salão** — envie uma foto ou PDF da planta do local e desenhe as mesas por cima (redondas, retangulares, quadradas, ovais), com áreas (retângulo, oval, triângulo) e textos. Arraste, gire, redimensione, crie várias mesas de uma vez em grade.
- **Coberturas sobre a planta** — se o PDF já tem mesas desenhadas, a ferramenta *Cobrir* (tecla `C`) desenha retângulos brancos (ou da cor do papel, com conta-gotas) por cima delas, para as mesas da ferramenta não aparecerem duplicadas.
- **Edição rápida pelo teclado** — `1`–`4` criam mesas e `A`, `O`, `V`, `T` criam áreas e textos onde o ponteiro está; Shift+arrastar seleciona várias mesas para mover, alinhar, distribuir ou mudar lugares e tamanho de uma vez; `Ctrl+C`/`Ctrl+V`, `[`/`]` para lugares, `R` para girar.
- **Sentar convidados** — clique no convidado e depois na mesa, ou arraste. Arraste uma mesa sobre outra para trocar os grupos. A distribuição automática sugere mesas para quem ficou sem lugar, mantendo juntos o mesmo lado e grupo.
- **Dois lados** — uma lista para cada pessoa do casal, com as cores de cada lado nas cadeiras.
- **Crianças por faixa de idade** (ex.: 0 a 5 isentas, 6 a 12 meia), com a opção de crianças pequenas não ocuparem lugar.
- **Resumo** — contagem regressiva, números para o buffet, confirmações, convites enviados, ocupação das mesas e pendências.
- **Personalização** — nomes, data, local, cor principal, cor de cada lado e fonte do título. Vários eventos no mesmo navegador (útil para cerimonialistas).
- **Desfazer/refazer** para tudo, atalhos de teclado e menus com botão direito (ou toque longo).

## Importar convidados

Aceita Excel (`.xlsx`), LibreOffice (`.ods`), CSV ou linhas coladas de qualquer planilha (inclusive Google Planilhas). As colunas são reconhecidas automaticamente e dá para ajustar antes de importar. Planilhas com várias abas, títulos no topo e totais no fim são tratadas.

Para começar do zero, baixe o **modelo Excel** (Arquivo › Baixar modelo de planilha, ou o botão *Modelo Excel* na aba Convidados): cabeçalho pronto, listas suspensas para Lado, Grupo, Situação e Convite, uma aba de instruções e outra com exemplo. Colunas:

| Coluna | Conteúdo |
|---|---|
| Nome | Nome do convite: pessoa, casal ou família (obrigatório) |
| Adultos | Número de adultos |
| Crianças (faixa 1) / (faixa 2) | Número de crianças em cada faixa |
| Lado | Nome de quem casa, `A`/`B` ou `Dos dois` |
| Grupo | Família, Amigos, Padrinhos… (grupos novos são criados) |
| Situação | Confirmado, Pendente, Não vai (ou Sim/Não) |
| Mesa | Número ou nome da mesa |
| Convite enviado | Sim/Não |
| Telefone | Qualquer formato (abre o WhatsApp) |
| Observações | Texto livre |
| Código | Preenchido na exportação; mantenha para atualizar a lista depois |

A exportação para Excel usa as mesmas colunas: dá para exportar, editar no Excel e importar de volta atualizando quem já existe.

## Exportar

- **Imprimir ou salvar em PDF**: lista por mesa, “encontre sua mesa” (ordem alfabética), lista de presença para a recepção, placas das mesas, planta do salão, resumo para o buffet.
- **Planilhas**: Excel completo (convidados, por mesa, mesas, resumo) e CSV.
- **Compartilhar**: imagem da planta (PNG), página “Encontre sua mesa” (um arquivo HTML só com nomes e mesas, para publicar ou mandar aos convidados) e texto por mesa para colar no WhatsApp.
- **Backup** (`.json`, Ctrl+S): leva tudo, inclusive a imagem da planta, para outro computador.

## Seus dados

Tudo é salvo no armazenamento local do navegador (localStorage e IndexedDB). Isso significa:

- outra pessoa abrindo o mesmo endereço **não** vê os seus convidados;
- limpar os dados do navegador apaga o evento — **faça backups** (Ctrl+S);
- para trabalhar em outro computador, salve o backup e abra-o lá.

## Usar sem internet

Baixe o repositório (Code › Download ZIP), descompacte e abra o `index.html` no navegador. Tudo funciona offline, inclusive leitura de PDF e Excel.

## Desenvolvimento

Site estático, sem etapa de build: HTML, CSS e JavaScript puro (scripts clássicos, para funcionar também em `file://`).

```
index.html          estrutura e diálogos
assets/app.css      estilos
assets/js/core.js   estado, armazenamento, migração, tema
assets/js/ui.js     menus, dicas, menu de contexto, painéis
assets/js/floor.js  salão: mesas, áreas, zoom, imagem de fundo, coberturas
assets/js/plan.js   edição da planta: seleção múltipla, alinhar, copiar/colar, atalhos
assets/js/guests.js listas de convidados, seleção, distribuição
assets/js/views.js  cabeçalho, planilha, resumo, configurações, boas-vindas
assets/js/xlsxw.js  gerador de .xlsx (modelo e exportação, com listas suspensas)
assets/js/io.js     importar, exportar, imprimir, backup
assets/js/main.js   menus, atalhos e inicialização
vendor/             bibliotecas carregadas sob demanda
```

Para testar localmente basta abrir o `index.html`. Publicação: GitHub Pages servindo a branch `main`, pasta raiz — https://lforalozzo.github.io/mapa-de-mesas/

## Créditos

- [PDF.js](https://github.com/mozilla/pdf.js) 3.11 — Apache 2.0
- [SheetJS Community Edition](https://sheetjs.com) 0.18.5 (leitura de planilhas) — Apache 2.0
- Fontes [Inter](https://rsms.me/inter/), [Cormorant Garamond](https://github.com/CatharsisFonts/Cormorant), [Playfair Display](https://github.com/clauseggers/Playfair) e [Great Vibes](https://github.com/googlefonts/great-vibes) — SIL Open Font License

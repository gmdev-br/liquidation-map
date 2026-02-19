# Correções de Persistência de Configurações

## Problema Identificado
Algumas opções não estavam com persistência consistente. Ao recarregar a página, as opções voltavam ao normal.

## Causa Raiz
Várias funções que modificam o estado da aplicação não estavam chamando `saveSettings()` após as alterações, e a função `loadSettings()` não estava atualizando o estado interno corretamente.

## Correções Aplicadas

### 1. Filtros (events/init.js)
- **Problema**: Filtros não salvavam configurações ao serem alterados
- **Solução**: Adicionado `saveSettings()` no evento `change` dos filtros
- **Arquivo**: `js/events/init.js` (linhas 109-112)

### 2. Velocidade de Scan (events/handlers.js)
- **Problema**: Velocidade não era persistida
- **Solução**: Adicionado `saveSettings()` na função `updateSpeed()`
- **Arquivo**: `js/events/handlers.js` (linha 36)

### 3. Ordenação (ui/filters.js)
- **Problema**: Ordenação da tabela não era salva
- **Solução**: Adicionado `saveSettings()` na função `sortBy()`
- **Arquivo**: `js/ui/filters.js` (linha 25)

### 4. Comboboxes (ui/combobox.js)
- **Problema**: Seleções de combobox (exceto moeda) não eram salvas
- **Solução**: Adicionado `saveSettings()` na função `cbSelect()`
- **Arquivo**: `js/ui/combobox.js` (linha 92)

### 5. Seleção de Moedas (ui/combobox.js)
- **Problema**: Seleção de moedas não era persistida
- **Solução**: Adicionado `saveSettings()` na função `selectCoin()`
- **Arquivo**: `js/ui/combobox.js` (linha 167)

### 6. Remoção de Moedas (ui/panels.js)
- **Problema**: Remoção de moedas não era salva
- **Solução**: Adicionado `saveSettings()` na função `removeCoin()`
- **Arquivo**: `js/ui/panels.js` (linha 322)

### 7. Carregamento de Configurações (storage/settings.js) - CORREÇÃO CRÍTICA
- **Problema**: `loadSettings()` não estava atualizando o estado interno, apenas os elementos DOM
- **Solução**: Adicionadas chamadas para funções `set*` ao carregar configurações
- **Arquivo**: `js/storage/settings.js`
  - `setRankingLimit()` e `setColorMaxLev()` (linhas 206, 210)
  - `setChartHighLevSplit()` (linha 216)
  - `setChartMode()` (linha 149)
  - `setBubbleScale()` e `setAggregationFactor()` (linhas 163, 168)
  - `setShowSymbols()` (linha 142)
  - `setPriceMode()` e `updatePriceModeUI()` (linhas 200-201)
  - `setPriceUpdateInterval()` e UI elements (linhas 206-214)

### 8. Price Update Interval (storage/settings.js) - NOVO
- **Problema**: `priceUpdateInterval` não estava sendo salvo nas configurações
- **Solução**: Adicionado `getPriceUpdateInterval()` no salvamento e carregamento
- **Arquivo**: `js/storage/settings.js` (linha 61 no save, linhas 205-214 no load)

## Configurações Agora Persistidas

✅ **Ranking Limit**: Quantidade de ativos no ranking
✅ **Color Max Leverage**: Alavancagem máxima para coloração
✅ **Chart Mode**: Modo do gráfico (scatter/column)
✅ **Filtros**: minValue, coinFilter, sideFilter, minLev, maxLev, minSize, minSzi, maxSzi, minValueCcy, maxValueCcy, minEntryCcy, maxEntryCcy, minUpnl, maxUpnl, minFunding, levTypeFilter, addressFilter

✅ **Controles**: Speed (velocidade de scan), Price Update Interval
✅ **Price Mode**: realtime ou dailyclose
✅ **Show Symbols**: Exibição de símbolos nas moedas

✅ **Ordenação**: sortKey, sortDir

✅ **Comboboxes**: sideFilter, levTypeFilter

✅ **Moedas**: selectedCoins (seleção e remoção)

✅ **Visualizações**: showSymbols, chartMode, bubbleScale, aggregationFactor

✅ **Janelas**: activeWindow

✅ **Cores**: colorMaxLev, chartHighLevSplit

✅ **Colunas**: visibleColumns, columnOrder

✅ **Moedas**: activeCurrency, activeEntryCurrency

✅ **Alturas**: chartHeight, liqChartHeight

## Testes
Criados arquivos de teste:
- `test_persistence.html` - Teste geral de persistência
- `test_specific_persistence.html` - Teste específico para ranking limit, color max lev e chart mode
- `test_new_persistence.html` - Teste específico para speed, price update, price mode e show symbols

## Verificação
Após as correções, todas as configurações devem persistir corretamente ao recarregar a página, incluindo:
- **Quantidade de ativos no ranking** (rankingLimit)
- **Alavancagem máxima para coloração** (colorMaxLev) 
- **Modo do gráfico** (chartMode) - scatter ou column
- **Velocidade de obtenção dos dados** (speed)
- **Atualização de preços** (priceUpdateInterval)
- **Price mode** (priceMode) - realtime ou dailyclose
- **Exibição de símbolos** (showSymbols)

## Problemas Específicos Corrigidos

1. **Ranking Limit não persistia**: Agora `setRankingLimit()` é chamado ao carregar
2. **Color Max Lev não persistia**: Agora `setColorMaxLev()` é chamado ao carregar  
3. **Chart Mode não ativava**: Agora `setChartMode()` é chamado ao carregar, ativando os controles corretos
4. **Price Mode não persistia**: Linhas comentadas foram descomentadas e `setPriceMode()` adicionado
5. **Show Symbols não persistia**: Adicionado `setShowSymbols()` ao carregar
6. **Price Update Interval não era salvo**: Adicionado ao salvamento e carregamento com atualização da UI

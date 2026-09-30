# Diretório de Classificação NCM (classify-ncm)

**Versão:** 4.0.0 — Conhecimento Vinculante e Princípios Genéricos Universais
**Escopo:** Catálogo Geral — Capítulos 84, 85, 90 e posições correlatas.

Este documento constitui a **Fonte Única da Verdade** (Knowledge Layer) para a inteligência de classificação aduaneira da edge function `classify-ncm`. Todas as diretrizes são princípios genéricos abstratos aplicáveis a qualquer mercadoria e nunca regras casuísticas ou atreladas a produtos específicos.

---

## 1. REGRAS-MESTRE DE CLASSIFICAÇÃO ADUANEIRA

### 1.1. Soberania da Função Primária

- A **função primordial** do produto determina o Capítulo e a Posição na Nomenclatura Comum do Mercosul (NCM).
  - Exemplo de princípio: captar/gravar/reproduzir/comutar/exibir imagem ou som, processamento de sinal ou comunicação → priorizar Capítulo 85; processamento mecânico/térmico → posições conexas do Capítulo 84; Capítulo 90 apenas quando houver componente óptico de precisão ou instrumentação/medição real.
- **Marketing e termos comerciais JAMAIS deslocam capítulo:** Nomes comerciais, slogans publicitários ou embalagens ("Cinema", "Cine", "Movie", "Broadcast", "Studio", "Multiuso", "3 em 1") não possuem valor aduaneiro para alterar a posição da mercadoria. O que define a posição é a constituição física, o princípio de funcionamento e o resultado operacional real do equipamento.

### 1.2. Soberania do Texto Literal da NCM e Hierarquia das RGIs

- O texto literal das quatro primeiras casas (Posição) e das Notas de Seção e de Capítulo tem soberania legal absoluta (**RGI 1**).
- A aplicação das Regras Gerais de Interpretação obedece à ordem hierárquica estrita:
  1. **RGI 1:** Classificação determinada pelo texto das posições e notas de seção/capítulo.
  2. **RGI 3a:** A posição mais específica prevalece sobre a posição de alcance mais genérico.
  3. **RGI 3b:** Aplicável a misturas, obras compostas e sortidos/kits acondicionados para venda a retalho que não possam ser classificados pela RGI 3a. A determinação funda-se na matéria ou elemento que lhes confira o **caráter essencial**. Só usar a RGI 3b quando as subposições forem genuinamente concorrentes.
  4. **RGI 6:** A classificação de mercadorias nas subposições de uma mesma posição é determinada pelos textos dessas subposições e das Notas de Subposição respectivas.

### 1.3. Vigência Obrigatória na TEC e Base Oficial `imp_sim_tax_rates`

- **PROIBIÇÃO DE CÓDIGOS EXTINTOS OU INVENTADOS:** É terminantemente PROIBIDO propor códigos extintos decorrentes de reestruturações da NCM (antigas edições da TEC) ou inventar desdobramentos de 8 dígitos ou Ex-Tarifários que não existam na tabela oficial em vigor.
- **Validação de Existência Prévia:** Todo código proposto (recomendação ou alternativa) deve estar presente e VIGENTE na base oficial `imp_sim_tax_rates` / `imp_sim_tax_rates_effective`. Se um código constar em dados legados com estrutura revogada, deve ser descartado em favor da subposição vigente.

### 1.4. Alternativas e Ex-Tarifários

- Cada alternativa proposta deve ser justificada explicitando a **RGI aplicável** e a **menor carga tributária legítima (II / IPI)**.
- **Ex-Tarifário (BK / BIT):** Só pode ser concedido quando houver estrito atendimento ao checklist de condições técnicas literais:
  1. Todos os parâmetros técnicos, capacidades, padrões e descritores do texto oficial do Ex devem estar plenamente comprovados no perfil técnico do produto.
  2. Citação obrigatória da resolução/portaria concessiva do Ex-Tarifário.
  3. Havendo qualquer discrepância técnica ou falta de comprovação, o Ex deve ser sumariamente vetado, mantendo-se a alíquota da posição plena.

### 1.5. Gatilho Condicional de Busca Web

- Sempre que as informações internas (marca, modelo, descrição e especificações) forem sumárias, insuficientes ou contraditórias para dirimir a identidade ontológica, a composição de kits ou os qualificadores técnicos vinculantes (nº de entradas, sensores, potência, etc.), o sistema **DEVE acionar compulsoriamente a busca web** antes de qualquer deliberação de classificação.

### 1.6. Abrangência do Conceito de "Partes" (Nota 2 dos Capítulos 84, 85 e 90)

- Na NCM, o conceito de "partes e acessórios reconhecíveis" abrange não apenas peças de reposição/sobressalentes (componentes de reposição pura), mas também **acessórios dependentes sem função autônoma** (dispositivos periféricos de comando, manoplas de acionamento servo-assistido, consoles dedicados que só adquirem utilidade operando acoplados à máquina principal).
- A proibição inversa de classificar como parte aplica-se estritamente à **peça de reposição pura** concorrendo com equipamento completo independente.

### 1.7. NCM Residual Supletiva Condicional 8543.70.99

- A NCM **85437099** ("Outras máquinas e aparelhos elétricos com função própria, não especificados nem compreendidos noutras posições") atua como **residual supletivo condicional** — incluir somente quando não existir enquadramento específico, quando o principal for residual, ou em caso de lacuna técnica. Produtos com enquadramento específico próprio (85.18, 85.25, 85.28, 85437035/36, 85299090, 96200000) não recebem 85437099 nas alternativas.

### 1.8. Veto Tecnológico da Posição 90.07 e Redirecionamento Determinístico

- A posição **90.07** é restrita por definição da TEC a equipamentos que utilizam **película fotográfica / filme cinematográfico**.
- Equipamentos dotados de **captação eletrônica/digital** (sensores CMOS, CCD, processadores de sinal digital, gravação em estado sólido/SSD, interfaces SDI/HDMI/IP) são **inelegíveis** para o Capítulo 90 (veto tecnológico eliminatório, score -300).
- **Redirecionamento determinístico para a posição 85.25:**
  - 1 a 2 sensores/captadores de imagem físicos → **85258929** (Outras câmeras digitais e de vídeo);
  - 3 ou mais sensores/captadores físicos independentes → **85258921** (Com três ou mais captadores de imagem).

---

## 2. DIRETRIZES DE VIGÊNCIA E MAPEAMENTO TÉCNICO

### 2.1. Câmeras de Televisão, Digitais e de Vídeo (Posição 85.25)

- **CÓDIGO EXTINTO 8525.80.xx:** É PROIBIDO classificar em 8525.80.90 ou qualquer desdobramento 8525.80 (revogados pela reestruturação do Sistema Harmonizado / NCM). Registros legados remanescentes devem ser desconsiderados.
- **Subposição Vigente 8525.89:**
  - **85258921:** Câmeras digitais / de vídeo com 3 ou mais captadores de imagem físicos (II 7,2% / IPI 13%).
  - **85258929:** Outras câmeras digitais / de vídeo (1 ou 2 captadores) (II 20% / IPI 15%).
  - **85258911 a 85258919:** Câmeras de televisão de estúdio/broadcast (quando a descrição comercial comprovar inequivocamente câmera de infraestrutura de televisão).

### 2.2. Matrizes de Comutação (Routing Switchers) vs. Misturadores de Produção (Switchers)

- **Matriz / Routing Switcher:** Dispositivo passivo ou ativo de roteamento e distribuição de crosspoint:
  - Mais de 20 entradas **E** mais de 16 saídas de áudio ou vídeo → **85437036** (Roteador-comutador / routing switcher).
  - Demais matrizes e roteadores que não atinjam cumulativamente ambas as condições → **85437039** (Outros).
- **Misturador de Produção / Switcher de Produção ao Vivo:** Equipamento ativo de processamento, mixagem em tempo real, transições e efeitos:
  - 8 ou mais entradas de vídeo declaradas → **85437035** ("Misturador digital, em tempo real, com oito ou mais entradas").
  - Menos de 8 entradas de vídeo declaradas → **85437039** (Outros).

### 2.3. Ex-Tarifários Reais e Vigentes da NCM 8543.70.99

- **Ex 164 da NCM 85437099:** Vigente e real na base de dados (`imp_sim_tax_rates`). Descreve mesas de comutação de sinais de áudio e vídeo com no mínimo 32 entradas e interfaces IP/SDI/HD-SDI (II reduzido para 0%). Quando as condições técnicas forem integralmente satisfeitas, deve ser priorizada como alternativa de menor carga tributária, acompanhada do checklist de conformidade.
- **Ex 067, 070 e 167 da NCM 85437099:** Ex-tarifários reais e vigentes (réguas de conexões digitais, demultiplexadores e conversores de interface). **Não existe** na TEC o Ex "amplificadores seriais com retemporizador" — deve-se utilizar os Ex reais correspondentes da base.

### 2.4. Gravação e Exibição de Imagem

- **Gravadores de Vídeo e Áudio Profissionais:** Devem ser enquadrados na posição **85219000** ("Aparelhos de gravação ou de reprodução de vídeo, mesmo incorporando um receptor de sinais de vídeo").
- **Monitores de Computador / Dados:** Enquadram-se na subposição **85285200** ("Capazes de serem conectados diretamente a uma máquina automática para processamento de dados da posição 84.71"). Códigos da série 8528.51.xx são extintos e inexistentes na TEC vigente.
- **Iluminação e Luminárias:** Spots e luminárias não-LED profissionais devem ser direcionados para **94054200** (único código presente na base da família 9405.4x), incluindo o aviso padrão: _"confirmar vigência da divisão LED/não-LED no Siscomex"_.

### 2.5. Tripés, Monopés e Suportes de Foto/Vídeo (Posição Mandatória 96.20 / 96200000)

- **Tripés mecânicos, monopés, pedestais manuais e cabeças fluidas manuais:** Enquadramento **MANDATÓRIO na posição 96.20 (código 96200000, Capítulo 96)** — "Monopés, bipés, tripés e artigos semelhantes".
- **Decisão Vinculante:** "Tripé nada tem a ver com 85299090. Ele está em 9620". Tripés mecânicos de foto/vídeo e cabeças fluidas manuais são classificados em 9620 (Capítulo 96), **NUNCA em 85299090 como recomendação principal**.
- **Aviso Obrigatório de Alíquota Siscomex:** Como a posição 96200000 está ausente da base local `imp_sim_tax_rates`, a resposta deve retornar as alíquotas com aviso explícito: _"Alíquotas indisponíveis na base local — verificar no Siscomex"_.
- **Veto ao Capítulo 90:** É TERMINANTEMENTE PROIBIDO enquadrar tripés, cabeças fluidas ou suportes mecânicos no Capítulo 90 (como microscópios ou instrumentos ópticos 90.11) ou em posições de imagem/telecomunicações (85.25 / 85.28).
- **Alternativas:**
  - **85299090:** Pode constar apenas como alternativa de menor prioridade (parte/acessório reconhecível destinado aos aparelhos de vídeo).
  - **85437099:** Alternativa apenas para suportes ou pedestais motorizados dotados de função elétrica autônoma comprovada (não se aplica a tripés puramente mecânicos).

### 2.6. Códigos Granulares Ausentes da Base Local

- Para produtos enquadráveis em famílias granulares específicas ausentes da tabela local (ex.: móveis técnicos da posição 9403, artefatos plásticos do Capítulo 39, projetores 8528.69.00): propor o código vigente e incluir obrigatoriamente a advertência: _"confirmar no Siscomex"_.

---

## 3. PROTOCOLO DE SAÍDA E AUDITORIA

Toda resposta estruturada de classificação deve conter:

1. **Recomendação Principal:** NCM (8 dígitos), Ex (se homologado), descrição oficial da linha, alíquotas oficiais (II, IPI, PIS, COFINS, total), justificativa técnica clara em uma frase fundamentando o enquadramento na RGI e notas aplicáveis.
2. **Alternativas Tributárias e Técnicas:** Lista de alternativas viáveis, cada uma indicando código, Ex, descrição, alíquotas, RGI aplicada, justificativa concisa e identificação da menor carga tributária.
3. **Análise de Composição (Fase 0):** Caracterização do produto em relação a kits/sistemas (RGI 3b) e identificação de máquinas de destino.
4. **Supressão de Checklist de Ex Inexistente:** O relatório só apresenta checklist de Ex quando houver efetivamente um Ex-Tarifário proposto.

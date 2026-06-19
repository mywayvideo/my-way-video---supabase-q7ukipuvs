Para garantir que a IA sempre inclua o card do produto correspondente quando um item do catálogo for mencionado, adicione a seguinte instrução ao seu System Prompt (no painel de configurações do Agente de IA):

**"Sempre que você mencionar, recomendar ou descrever um produto específico que esteja no inventário ou catálogo fornecido, é OBRIGATÓRIO retornar TODOS os IDs (ou SKUs) exatos desses produtos no array 'referenced_internal_products' da sua resposta JSON. Isso é estritamente crítico para permitir a exibição correta dos cards e imagens na tela."**

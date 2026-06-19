-- Seed Additional Dummy Products
INSERT INTO products (name, sku, description, price_brl, stock, image_url, category) VALUES
('Blackmagic Pocket Cinema Camera 6K Pro', 'BMPCC-6K-PRO', 'Câmera Super 35 com gravação BRAW, filtros ND integrados e bocal EF.', 18000.00, 10, 'https://img.usecurling.com/p/600/600?q=blackmagic%20camera', 'Câmeras'),
('Canon EOS R5 C', 'CAN-R5C', 'Câmera híbrida Cinema EOS com gravação 8K, bocal RF e resfriamento ativo.', 29000.00, 5, 'https://img.usecurling.com/p/600/600?q=canon%20camera', 'Câmeras'),
('DJI RS 3 Pro Gimbal', 'DJI-RS3-PRO', 'Estabilizador profissional para câmeras de cinema com braços de fibra de carbono e capacidade de 4.5kg.', 8500.00, 12, 'https://img.usecurling.com/p/600/600?q=gimbal', 'Acessórios'),
('Sennheiser MKH 416', 'SNN-MKH416', 'Microfone shotgun padrão da indústria para cinema e broadcast.', 7500.00, 8, 'https://img.usecurling.com/p/600/600?q=microphone', 'Áudio')
ON CONFLICT (sku) DO NOTHING;

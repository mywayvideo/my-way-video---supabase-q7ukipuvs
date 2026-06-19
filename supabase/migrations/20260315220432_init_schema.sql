-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create Products Table
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    sku TEXT UNIQUE,
    description TEXT,
    price_brl NUMERIC DEFAULT 0,
    stock INTEGER DEFAULT 0,
    image_url TEXT,
    ncm TEXT,
    weight NUMERIC,
    dimensions TEXT,
    category TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create Company Info Table for AI Knowledge Base
CREATE TABLE company_info (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Company Info
INSERT INTO company_info (content) 
VALUES ('Company name: Multisale Enterprises Inc. DBA My Way Business. Address: 1735 NW 79th Av., Doral, FL 33126. Phone/WhatsApp: +1-786-716-1170. Com sede em Doral, na Florida, USA, e atuando há mais de 25 anos no mercado profissional de audiovisual, a MY WAY VIDEO fornece câmeras de vídeo e de cinema e toda uma gama de acessórios para produção audiovisual. A maioria dos produtos comercializados pela MY WAY possui garantia de seus fabricantes no Brasil e demais países da América Latina. Representando grandes marcas, a mywayvideo.com oferece um programa de descontos para empresas do ramo e condições especiais para revendedores e integradores. A plataforma de e-commerce mywayvideo.com fornece informações detalhadas para o envio de seus produtos ao exterior e muitos outros benefícios. Confira a seguir o que oferecemos: Variedade de Produtos: Somos especializados em câmeras de vídeo e cinema, além de uma vasta gama de acessórios para produção audiovisual. Distribuição Eficiente: Miami e Brasil. Garantia Direta dos Fabricantes. Agilidade Operacional. Preço em Reais. Taxa de Conversão Atualizada. Descontos Exclusivos. Classificação Fiscal Detalhada (NCM). Informações Precisas (Peso e dimensões). Logística Simplificada. Atendimento Personalizado.');

-- Seed Dummy Products
INSERT INTO products (name, sku, description, price_brl, stock, image_url, category) VALUES
('Sony FX3 Cinema Line', 'SNY-FX3-01', 'Câmera de cinema compacta com sensor Full Frame, ideal para produções ágeis e gimbals.', 25000.00, 15, 'https://img.usecurling.com/p/600/600?q=sony%20camera', 'Câmeras'),
('ARRI Alexa Mini LF', 'ARR-AMLF-01', 'A escolha padrão de Hollywood. Sensor Large Format para um look cinematográfico imersivo.', 350000.00, 0, 'https://img.usecurling.com/p/600/600?q=arri%20alexa', 'Câmeras'),
('Zeiss CP.3 35mm T2.1', 'ZSS-CP3-35', 'Lente prime compacta com excelente nitidez e reprodução de cores.', 28000.00, 8, 'https://img.usecurling.com/p/600/600?q=zeiss%20lens', 'Lentes'),
('Aputure LS 600d Pro', 'APT-600D-01', 'Iluminador LED Daylight de alta potência, resistente a intempéries.', 12000.00, 22, 'https://img.usecurling.com/p/600/600?q=studio%20light', 'Iluminação');

-- Seed Admin User
DO $$
DECLARE
  new_user_id uuid;
BEGIN
  new_user_id := gen_random_uuid();
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    is_super_admin, role, aud,
    confirmation_token, recovery_token, email_change_token_new,
    email_change, email_change_token_current,
    phone, phone_change, phone_change_token, reauthentication_token
  ) VALUES (
    new_user_id,
    '00000000-0000-0000-0000-000000000000',
    'admin@mywayvideo.com',
    crypt('admin123', gen_salt('bf')),
    NOW(), NOW(), NOW(),
    '{"provider": "email", "providers": ["email"]}',
    '{"name": "Administrador"}',
    false, 'authenticated', 'authenticated',
    '', '', '', '', '',
    NULL, '', '', ''
  );
END $$;

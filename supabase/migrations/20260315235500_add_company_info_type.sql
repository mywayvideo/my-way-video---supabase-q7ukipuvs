-- Add a type column to differentiate between AI knowledge base and Footer text
ALTER TABLE public.company_info ADD COLUMN type TEXT NOT NULL DEFAULT 'ai_knowledge';

-- Insert the default footer text into company_info
INSERT INTO public.company_info (type, content) 
VALUES ('footer_about', 'Seu parceiro definitivo em equipamentos de audiovisual profissional. Qualidade, garantia e suporte técnico especializado.');

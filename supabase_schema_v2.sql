-- Fandayz WhatsApp AI Agent - Supabase Schema V2

-- 1. تحديث حالات العميل (State Machine)
ALTER TYPE customer_status ADD VALUE IF NOT EXISTS 'start';
ALTER TYPE customer_status ADD VALUE IF NOT EXISTS 'service_explained';
ALTER TYPE customer_status ADD VALUE IF NOT EXISTS 'packages_sent';
ALTER TYPE customer_status ADD VALUE IF NOT EXISTS 'package_selected';
ALTER TYPE customer_status ADD VALUE IF NOT EXISTS 'data_collected';
ALTER TYPE customer_status ADD VALUE IF NOT EXISTS 'waiting_review';
ALTER TYPE customer_status ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE customer_status ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE customer_status ADD VALUE IF NOT EXISTS 'waiting_payment';
ALTER TYPE customer_status ADD VALUE IF NOT EXISTS 'transferring';
ALTER TYPE customer_status ADD VALUE IF NOT EXISTS 'completed';

-- 2. جدول الباقات
CREATE TABLE IF NOT EXISTS packages (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  total_installments NUMERIC NOT NULL,
  monthly_installment NUMERIC NOT NULL,
  net_transfer NUMERIC NOT NULL,
  duration_months INTEGER DEFAULT 6,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- إدخال الباقات الافتراضية
INSERT INTO packages (name, total_installments, monthly_installment, net_transfer) VALUES
('الباقة الأولى', 1080, 180, 1050),
('الباقة الثانية', 1350, 225, 1300),
('الباقة الثالثة', 1530, 255, 1500),
('الباقة الرابعة', 2700, 450, 2600),
('الباقة الخامسة', 5400, 900, 5150),
('الباقة السادسة', 8100, 1350, 7700),
('الباقة السابعة', 10800, 1800, 10300)
ON CONFLICT DO NOTHING;

-- 3. تحديث جدول العملاء لدعم State Machine
ALTER TABLE customers ADD COLUMN IF NOT EXISTS state_machine_status VARCHAR(50) DEFAULT 'start';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS package_id INTEGER REFERENCES packages(id);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_interaction_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 4. جدول تتبع الرسائل لمنع التكرار (Anti-duplicate)
CREATE TABLE IF NOT EXISTS processed_messages (
  whatsapp_message_id VARCHAR(255) PRIMARY KEY,
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. جدول إعدادات النظام (لـ Telegram وغيرها)
CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(50) PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- إدخال إعدادات Telegram فارغة
INSERT INTO system_settings (key, value, description) VALUES
('TELEGRAM_BOT_TOKEN', '', 'Token for Telegram Bot'),
('TELEGRAM_CHAT_ID', '', 'Chat ID for Telegram notifications')
ON CONFLICT DO NOTHING;

-- 6. تحديث RLS Policies (للتأمين)
-- سنقوم بتمكين RLS على جميع الجداول، والوصول سيكون فقط عبر Service Role (لـ Backend) 
-- أو Authenticated Users (لـ Dashboard بعد تسجيل الدخول)

ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read packages" ON packages FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users to read system_settings" ON system_settings FOR SELECT USING (auth.role() = 'authenticated');

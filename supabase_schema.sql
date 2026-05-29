-- Fandayz WhatsApp AI Agent - Supabase Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enum for customer statuses
CREATE TYPE customer_status AS ENUM (
  'new_customer',
  'waiting_customer_reply',
  'data_submitted',
  'waiting_human_followup',
  'payment_pending',
  'completed',
  'rejected'
);

-- Enum for message roles
CREATE TYPE message_role AS ENUM ('user', 'assistant', 'human_agent');

-- Customers Table
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255),
  status customer_status DEFAULT 'new_customer',
  is_human_handoff BOOLEAN DEFAULT FALSE,
  national_id VARCHAR(20),
  tabby_tamara_number VARCHAR(20),
  selected_package VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Messages Table
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  role message_role NOT NULL,
  content TEXT NOT NULL,
  whatsapp_message_id VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_customers_phone ON customers(phone_number);
CREATE INDEX idx_customers_status ON customers(status);
CREATE INDEX idx_messages_customer_id ON messages(customer_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- Trigger to update 'updated_at' in customers table
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_customers_modtime
BEFORE UPDATE ON customers
FOR EACH ROW
EXECUTE FUNCTION update_modified_column();

-- Setup Row Level Security (RLS)
-- For a simple backend, we might just use the service_role key, but it's good practice to define RLS.
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (service_role bypasses RLS anyway)
CREATE POLICY "Allow full access to authenticated users on customers" ON customers FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow full access to authenticated users on messages" ON messages FOR ALL USING (auth.role() = 'authenticated');

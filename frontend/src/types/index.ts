// Type definitions for Core entities

export interface Company {
  id: string;
  name: string;
  website: string;
  email?: string;
  phone?: string;
  industry?: string;
  sentimentScore?: number;
  status?: 'hot' | 'cold' | 'warm' | 'dead';
  createdAt: Date;
  updatedAt: Date;
}

export interface EmailCampaign {
  id: string;
  companyId: string;
  to: string;
  subject: string;
  body: string;
  sentiment?: 'hot' | 'cold' | 'warm';
  status: 'draft' | 'sent' | 'bounced' | 'opened' | 'clicked';
  sentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  companyId: string;
  type: 'email' | 'whatsapp';
  from: string;
  to: string;
  subject?: string;
  body: string;
  sentiment?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Lead {
  id: string;
  companyId: string;
  name: string;
  email: string;
  phone?: string;
  title?: string;
  position?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Board {
  id: string;
  title: string;
  columns: BoardColumn[];
  createdAt: Date;
  updatedAt: Date;
}

export interface BoardColumn {
  id: string;
  title: string;
  status: 'hot' | 'cold' | 'warm' | 'dead';
  companies: Company[];
}

export interface AutomationTask {
  id: string;
  type: 'scrape' | 'email' | 'validate';
  status: 'pending' | 'running' | 'completed' | 'failed';
  data: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

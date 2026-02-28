/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Shield,
  FileText,
  Users,
  Link as LinkIcon,
  Calendar,
  Gavel,
  Search,
  Bell,
  CheckCircle2,
  Clock,
  ChevronRight,
  Send,
  AlertTriangle,
  ArrowUpRight,
  MoreHorizontal,
  Mail,
  User,
  Activity,
  Database
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types & Interfaces ---

type ActiveTab = 'inbox' | 'intelligence' | 'scribe' | 'attache' | 'connector' | 'legal' | 'database';
type Priority = 'high' | 'medium' | 'low';
type AgentStatus = 'active' | 'idle' | 'alert';

interface Agent {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  icon: React.ReactNode;
  tasks: number;
}

interface BriefItem {
  id: string;
  tag: string;
  source: string;
  timestamp: string;
  headline: string;
  body: string;
  priority: Priority;
  flag: boolean;
  action?: string;
}

interface InboxMessage {
  id: string;
  from: string;
  org: string;
  subject: string;
  urgency: Priority;
  category: string;
  read: boolean;
  draft?: string;
  time: string;
}

interface MatchRecord {
  id: string;
  homeEntity: string;
  localEntity: string;
  score: number;
  rationale: string;
  status: 'queued' | 'ready' | 'urgent' | 'actioned';
}

interface ScribeTask {
  id: string;
  title: string;
  audience: string;
  progress: number;
  status: 'queued' | 'drafting' | 'delivered';
  due: string;
}

// --- Mock Data ---

const AGENTS: Agent[] = [
  { id: 'consul', name: 'The Consul', role: 'Master Orchestrator', status: 'active', icon: <Shield className="w-4 h-4" />, tasks: 0 },
  { id: 'sentinel', name: 'The Sentinel', role: 'Intelligence & Monitoring', status: 'active', icon: <Search className="w-4 h-4" />, tasks: 14 },
  { id: 'scribe', name: 'The Scribe', role: 'Reporting & Drafting', status: 'active', icon: <FileText className="w-4 h-4" />, tasks: 3 },
  { id: 'attache', name: 'The Attaché', role: 'Delegation & Logistics', status: 'active', icon: <Users className="w-4 h-4" />, tasks: 8 },
  { id: 'connector', name: 'The Connector', role: 'Trade Matchmaking & CRM', status: 'idle', icon: <LinkIcon className="w-4 h-4" />, tasks: 0 },
  { id: 'legal', name: 'Sentinel-Legal', role: 'Regulatory & Compliance', status: 'alert', icon: <Gavel className="w-4 h-4" />, tasks: 2 },
];

// --- Components ---

const StatusBadge = ({ status }: { status: string }) => {
  const colors = {
    active: 'bg-green-500/10 text-green-400 border-green-500/20',
    idle: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
    alert: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    low: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
    delivered: 'bg-green-500/10 text-green-400 border-green-500/20',
    drafting: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    queued: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
    urgent: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    ready: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    actioned: 'bg-green-500/10 text-green-400 border-green-500/20',
  };

  return (
    <span className={`px-2 py-0.5 rounded-sm text-[9px] font-mono font-bold tracking-widest uppercase border ${colors[status as keyof typeof colors] || colors.idle}`}>
      {status}
    </span>
  );
};

const PriorityIndicator = ({ priority }: { priority: Priority }) => {
  const colors = {
    high: 'bg-orange-500',
    medium: 'bg-amber-500',
    low: 'bg-gray-500',
  };
  return <div className={`w-[3px] h-full absolute left-0 top-0 ${colors[priority]}`} />;
};

const Card = ({ children, className = '', priority }: { children: React.ReactNode; className?: string; priority?: Priority; key?: React.Key }) => (
  <div className={`bg-surface border border-border-subtle rounded-md relative overflow-hidden transition-all hover:border-border-hover hover:bg-surface-elevated ${className}`}>
    {priority && <PriorityIndicator priority={priority} />}
    <div className="p-4">{children}</div>
  </div>
);

const SectionHeader = ({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) => (
  <div className="flex items-baseline justify-between mb-4">
    <div>
      <h3 className="text-gold font-mono text-[10px] tracking-[0.2em] uppercase mb-1">{title}</h3>
      {subtitle && <p className="text-text-primary text-xl font-display italic">{subtitle}</p>}
    </div>
    {action}
  </div>
);

// --- Main Application ---

export default function App() {
  const [activeTab, setActiveTab] = useState('consul');
  const [command, setCommand] = useState('');
  const [approvals, setApprovals] = useState<Record<string, boolean>>({});
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'consul'; text: string }[]>([
    { role: 'consul', text: 'CONSUL ONLINE — Monday, 07:15 local time. 6 agents operational. 2 priority items require attention.' }
  ]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // State for fetched data
  const [agents, setAgents] = useState<Agent[]>([]);
  const [briefItems, setBriefItems] = useState<BriefItem[]>([]);
  const [inbox, setInbox] = useState<InboxMessage[]>([]);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [tasks, setTasks] = useState<ScribeTask[]>([]);
  const [delegation, setDelegation] = useState<any>(null);
  const [legalAlerts, setLegalAlerts] = useState<any[]>([]);
  const [scribeInput, setScribeInput] = useState('');
  const [scribeType, setScribeType] = useState('report');

  // New Entity form state
  const [showEntityForm, setShowEntityForm] = useState(false);
  const [newEntity, setNewEntity] = useState({
    type: 'home',
    name: '',
    sector: '',
    size: '',
    objectives: '',
    hs_codes: ''
  });

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [agentsRes, briefRes, inboxRes, matchesRes, tasksRes, delegationRes, legalRes] = await Promise.all([
        fetch('/api/agents/status'),
        fetch('/api/intelligence'),
        fetch('/api/inbox'),
        fetch('/api/matches'),
        fetch('/api/tasks'),
        fetch('/api/delegation/chamber-2025'),
        fetch('/api/legal-alerts?actioned=false')
      ]);

      const [agentsData, briefData, inboxData, matchesData, tasksData, delegationData, legalData] = await Promise.all([
        agentsRes.json(),
        briefRes.json(),
        inboxRes.json(),
        matchesRes.json(),
        tasksRes.json(),
        delegationRes.json(),
        legalRes.json()
      ]);

      // Map agent status to include icons and roles as they are not in DB yet
      const mappedAgents = agentsData.map((a: any) => {
        const staticInfo = AGENTS.find(sa => sa.id === a.id);
        return { ...a, name: staticInfo?.name, role: staticInfo?.role, icon: staticInfo?.icon };
      });

      setAgents(mappedAgents);
      setBriefItems(briefData);
      setInbox(inboxData);
      setMatches(matchesData);
      setTasks(tasksData);
      setDelegation(delegationData);
      setLegalAlerts(legalData);
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const handleCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;

    const userMsg = command.trim();
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setCommand('');

    // Show a thinking indicator
    setChatHistory(prev => [...prev, { role: 'consul', text: 'Processing command...' }]);

    try {
      const res = await fetch('/api/consul/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: userMsg })
      });
      const data = await res.json();

      // Replace the "processing" message with the real one
      setChatHistory(prev => {
        const newHistory = [...prev];
        newHistory[newHistory.length - 1] = { role: 'consul', text: data.response };
        return newHistory;
      });

      // Auto-refresh data in case an agent was triggered behind the scenes
      setTimeout(fetchData, 1500);

    } catch (error) {
      console.error("Error routing command:", error);
      setChatHistory(prev => {
        const newHistory = [...prev];
        newHistory[newHistory.length - 1] = { role: 'consul', text: "Error connecting to AI Orchestrator." };
        return newHistory;
      });
    }
  };

  const toggleApproval = async (type: 'inbox' | 'match' | 'brief', id: string) => {
    try {
      let endpoint = '';
      if (type === 'inbox') endpoint = `/api/inbox/${id}/approve`;
      if (type === 'match') endpoint = `/api/matches/${id}/approve`;

      if (endpoint) {
        await fetch(endpoint, { method: 'POST' });
        fetchData(); // Refresh data
      }

      setApprovals(prev => ({ ...prev, [id]: !prev[id] }));
    } catch (error) {
      console.error("Error approving item:", error);
    }
  };

  const commissionTask = async () => {
    if (!scribeInput.trim()) return;
    try {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: 'scribe',
          type: scribeType,
          title: scribeInput.split('\n')[0].substring(0, 50),
          instruction: scribeInput,
          payload: {
            audience: scribeType === 'speech' ? 'Business Leaders & Dignitaries' : 'Myanmar Ministry of Foreign Affairs',
            format: scribeType === 'speech' ? 'formal speech' : 'formal report',
            pages: 2
          }
        })
      });
      setScribeInput('');
      fetchData();
    } catch (error) {
      console.error("Error commissioning task:", error);
    }
  };

  const submitEntity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEntity.name || !newEntity.sector) return;
    try {
      await fetch('/api/entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newEntity,
          hs_codes: newEntity.hs_codes.split(',').map(c => c.trim()).filter(Boolean)
        })
      });
      setNewEntity({ type: 'home', name: '', sector: '', size: '', objectives: '', hs_codes: '' });
      setShowEntityForm(false);
      // Wait a moment for connector to run matches behind the scenes
      setTimeout(fetchData, 2000);
    } catch (error) {
      console.error("Error submitting entity:", error);
    }
  };

  const renderConsul = () => (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Column: Morning Brief & Inbox */}
      <div className="lg:col-span-8 space-y-8">
        {/* Morning Brief */}
        <section>
          <SectionHeader
            title="◈ Morning Brief"
            subtitle="Economic Intelligence Summary"
            action={<span className="text-text-muted font-mono text-[9px]">Generated 07:08 · Sentinel → Scribe</span>}
          />
          <div className="space-y-3">
            {briefItems.map(item => (
              <Card key={item.id} priority={item.priority as Priority}>
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-3">
                    <span className="bg-gold-dim text-gold font-mono text-[8px] px-1.5 py-0.5 rounded-sm tracking-widest">{item.tag}</span>
                    <span className="text-text-muted font-mono text-[9px]">{item.source}</span>
                  </div>
                  <span className="text-text-muted font-mono text-[9px]">{item.timestamp || item.published_at}</span>
                </div>
                <h4 className="text-text-primary text-lg font-display mb-1">{item.headline}</h4>
                <p className="text-text-muted text-sm leading-relaxed mb-4">{item.body}</p>
                {item.action && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleApproval('brief', item.id)}
                      className={`px-4 py-1.5 rounded-sm font-mono text-[10px] tracking-widest transition-all ${approvals[item.id]
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                        : 'bg-gold text-bg hover:opacity-90'
                        }`}
                    >
                      {approvals[item.id] ? '✓ ACTIONED' : `↗ ${item.action}`}
                    </button>
                    {!approvals[item.id] && <button className="text-text-muted font-mono text-[10px] hover:text-text-primary">Dismiss</button>}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </section>

        {/* Priority Inbox */}
        <section>
          <SectionHeader title="✉ Priority Inbox" subtitle="Awaiting Diplomat Adjudication" />
          <div className="bg-surface border border-border-subtle rounded-md divide-y divide-border-subtle">
            {inbox.map(msg => (
              <div key={msg.id} className="p-4 hover:bg-surface-elevated transition-colors group cursor-pointer" onClick={() => toggleApproval('inbox', msg.id)}>
                <div className="flex items-center gap-4">
                  <div className={`w-1.5 h-1.5 rounded-full ${msg.read ? 'bg-transparent border border-border-hover' : 'bg-gold'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-text-primary font-medium text-sm truncate">{msg.from_name || msg.from}</span>
                      <div className="flex items-center gap-3">
                        <StatusBadge status={msg.urgency === 'high' ? 'urgent' : 'ready'} />
                        <span className="text-text-muted font-mono text-[9px]">{msg.time || msg.received_at}</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <p className="text-text-muted text-xs truncate">{msg.from_org || msg.org} · {msg.subject}</p>
                      {msg.draft_body && <span className="text-gold font-mono text-[8px] tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">✦ DRAFT READY</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Right Column: Command & Fleet */}
      <div className="lg:col-span-4 space-y-8">
        {/* Command Interface */}
        <section>
          <SectionHeader title="◈ Command Interface" />
          <div className="bg-surface border border-border-subtle rounded-md h-[400px] flex flex-col">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {chatHistory.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-3 rounded-md text-xs leading-relaxed ${msg.role === 'user'
                    ? 'bg-gold/10 border border-gold/30 text-gold'
                    : 'bg-surface-elevated border border-border-subtle text-text-primary'
                    }`}>
                    {msg.role === 'consul' && <span className="block font-mono text-[8px] tracking-widest text-gold mb-1 uppercase">Consul</span>}
                    {msg.text}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={handleCommand} className="p-4 border-t border-border-subtle flex gap-2">
              <input
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="Instruct The Consul..."
                className="flex-1 bg-surface-elevated border border-border-subtle rounded-sm px-3 py-2 text-xs focus:outline-none focus:border-gold transition-colors"
              />
              <button type="submit" className="bg-gold text-bg p-2 rounded-sm hover:opacity-90 transition-opacity">
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {['SEZ analysis brief', 'AgriTech matches', 'Delegation status'].map(chip => (
              <button
                key={chip}
                onClick={() => setCommand(chip)}
                className="text-[9px] font-mono tracking-widest text-text-muted border border-border-subtle px-2 py-1 rounded-sm hover:border-gold hover:text-gold transition-colors"
              >
                {chip}
              </button>
            ))}
          </div>
        </section>

        {/* Agent Fleet */}
        <section>
          <SectionHeader title="⬡ Agent Fleet Status" />
          <div className="space-y-2">
            {agents.map(agent => (
              <div key={agent.id} className="bg-surface border border-border-subtle rounded-md p-3 flex items-center justify-between hover:bg-surface-elevated transition-colors cursor-pointer group">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-sm bg-surface-elevated border border-border-subtle group-hover:border-gold/30 transition-colors`}>
                    {agent.icon ? React.cloneElement(agent.icon as React.ReactElement, { className: 'w-4 h-4 text-gold' }) : <Activity className="w-4 h-4 text-gold" />}
                  </div>
                  <div>
                    <h4 className="text-text-primary text-xs font-medium">{agent.name}</h4>
                    <p className="text-text-muted text-[10px]">{agent.role}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {agent.tasks > 0 && <span className="font-mono text-[10px] text-gold bg-gold/10 px-1.5 rounded-full">{agent.tasks}</span>}
                  <div className={`w-2 h-2 rounded-full ${agent.status === 'active' ? 'bg-green-500 animate-pulse-soft' :
                    agent.status === 'alert' ? 'bg-orange-500' : 'bg-gray-500'
                    }`} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );

  const renderSentinel = () => (
    <div className="space-y-8 fade-in">
      <SectionHeader title="◈ The Sentinel" subtitle="Intelligence & Monitoring" />

      {/* Source Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { name: 'Ministry of Trade', status: 'live', last: '3m ago' },
          { name: 'Central Bank', status: 'live', last: '1h ago' },
          { name: 'Financial Times', status: 'live', last: '12m ago' },
          { name: 'UN Comtrade', status: 'live', last: '4h ago' },
        ].map(source => (
          <Card key={source.name} className="text-center">
            <div className="flex justify-center mb-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse-soft" />
            </div>
            <h4 className="text-text-primary text-xs font-medium mb-1">{source.name}</h4>
            <p className="text-text-muted font-mono text-[9px] uppercase tracking-widest">{source.status} · {source.last}</p>
          </Card>
        ))}
      </div>

      {/* Legal Alert */}
      {legalAlerts.length > 0 && (
        <div className="bg-orange-500/5 border border-orange-500/20 rounded-md p-6 flex gap-6">
          <div className="p-3 bg-orange-500/10 rounded-md h-fit">
            <AlertTriangle className="w-6 h-6 text-orange-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h4 className="text-text-primary text-lg font-display italic">Regulatory Alert: {legalAlerts[0].affected_regulation}</h4>
              <StatusBadge status="alert" />
              {legalAlerts[0].bit_conflict === 1 && (
                <span className="bg-red-500/20 text-red-400 font-mono text-[9px] px-2 py-0.5 rounded-sm tracking-widest border border-red-500/30 font-bold uppercase">
                  BIT CONFLICT
                </span>
              )}
            </div>
            <p className="text-text-muted text-sm leading-relaxed mb-4">
              {legalAlerts[0].summary}
            </p>
            {legalAlerts[0].bit_conflict === 1 && legalAlerts[0].bit_conflict_note && (
              <p className="text-red-400 text-xs italic mb-4">
                ⚠ {legalAlerts[0].bit_conflict_note}
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  try {
                    await fetch(`/api/legal-alerts/${legalAlerts[0].id}/action`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ note: "Flagged to delegation brief" })
                    });

                    await fetch('/api/tasks', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        agent: 'scribe',
                        type: 'report',
                        title: `Regulatory note: ${legalAlerts[0].affected_regulation}`,
                        instruction: `Draft a regulatory alert note on ${legalAlerts[0].affected_regulation} for inclusion in the delegation briefing book.`,
                        payload: { audience: "Delegation Members", format: "regulatory note", pages: 1 }
                      })
                    });

                    fetchData();
                  } catch (e) {
                    console.error("Failed to flag alert", e);
                  }
                }}
                className="bg-orange-500 text-bg px-4 py-1.5 rounded-sm font-mono text-[10px] tracking-widest hover:opacity-90">
                Flag to Delegation Brief
              </button>
              <button className="text-orange-400 border border-orange-500/30 px-4 py-1.5 rounded-sm font-mono text-[10px] tracking-widest hover:bg-orange-500/10">View Analysis</button>
            </div>
          </div>
        </div>
      )}

      {/* Feed */}
      <div className="space-y-4">
        <h3 className="text-gold font-mono text-[10px] tracking-[0.2em] uppercase">Intelligence Feed — Last 24 Hours</h3>
        {briefItems.map(item => (
          <Card key={item.id} priority={item.priority as Priority}>
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-3">
                <span className="bg-gold-dim text-gold font-mono text-[8px] px-1.5 py-0.5 rounded-sm tracking-widest">{item.tag}</span>
                <span className="text-text-muted font-mono text-[9px]">{item.source}</span>
              </div>
              <span className="text-text-muted font-mono text-[9px]">{item.timestamp || item.published_at}</span>
            </div>
            <h4 className="text-text-primary text-lg font-display mb-1">{item.headline}</h4>
            <p className="text-text-muted text-sm leading-relaxed">{item.body}</p>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderConnector = () => (
    <div className="space-y-8 fade-in">
      <SectionHeader title="◎ The Connector" subtitle="Trade Matchmaking & CRM" />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Exporters', value: '284', delta: '+12' },
          { label: 'Local Partners', value: '631', delta: '+8' },
          { label: 'Active Inquiries', value: '47', delta: '14 unmatched' },
          { label: 'Relationships', value: '1.2K', delta: '38 to re-engage' },
        ].map(stat => (
          <Card key={stat.label}>
            <p className="text-text-muted font-mono text-[9px] uppercase tracking-widest mb-1">{stat.label}</p>
            <h4 className="text-gold text-3xl font-display">{stat.value}</h4>
            <p className="text-text-muted font-mono text-[8px] mt-1">{stat.delta}</p>
          </Card>
        ))}
      </div>

      {/* Manual Run & Add Entity */}
      <div className="flex justify-end mt-4 gap-3">
        <button
          onClick={() => setShowEntityForm(true)}
          className="text-gold border border-gold/30 px-4 py-2 rounded-sm font-mono text-[10px] tracking-widest hover:bg-gold/10 transition-colors"
        >
          + Add Entity
        </button>
        <button
          onClick={async () => {
            try {
              await fetch('/api/agents/connector/run');
              const res = await fetch('/api/matches');
              const data = await res.json();
              setMatches(data);
            } catch (error) {
              console.error("Error running connector:", error);
            }
          }}
          className="bg-gold text-bg px-4 py-2 rounded-sm font-mono text-[10px] tracking-widest hover:opacity-90"
        >
          Run Matchmaking Analysis
        </button>
      </div>

      {showEntityForm && (
        <Card className="border-gold/30 bg-surface-elevated">
          <SectionHeader title="New Entity Record" subtitle="CRM Entry" />
          <form onSubmit={submitEntity} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-text-muted text-[10px] font-mono tracking-widest mb-1">TYPE</label>
                <select
                  value={newEntity.type}
                  onChange={e => setNewEntity({ ...newEntity, type: e.target.value })}
                  className="w-full bg-bg border border-border-subtle rounded-sm p-2 text-sm text-text-primary focus:border-gold outline-none"
                >
                  <option value="home">Home (Myanmar)</option>
                  <option value="local">Local (India)</option>
                </select>
              </div>
              <div>
                <label className="block text-text-muted text-[10px] font-mono tracking-widest mb-1">NAME</label>
                <input
                  required
                  value={newEntity.name}
                  onChange={e => setNewEntity({ ...newEntity, name: e.target.value })}
                  className="w-full bg-bg border border-border-subtle rounded-sm p-2 text-sm text-text-primary focus:border-gold outline-none"
                  placeholder="Company or Org Name"
                />
              </div>
              <div>
                <label className="block text-text-muted text-[10px] font-mono tracking-widest mb-1">SECTOR</label>
                <input
                  required
                  value={newEntity.sector}
                  onChange={e => setNewEntity({ ...newEntity, sector: e.target.value })}
                  className="w-full bg-bg border border-border-subtle rounded-sm p-2 text-sm text-text-primary focus:border-gold outline-none"
                  placeholder="e.g. Agriculture, Healthcare"
                />
              </div>
              <div>
                <label className="block text-text-muted text-[10px] font-mono tracking-widest mb-1">COMPANY SIZE</label>
                <input
                  value={newEntity.size}
                  onChange={e => setNewEntity({ ...newEntity, size: e.target.value })}
                  className="w-full bg-bg border border-border-subtle rounded-sm p-2 text-sm text-text-primary focus:border-gold outline-none"
                  placeholder="e.g. Enterprise, SME"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-text-muted text-[10px] font-mono tracking-widest mb-1">OBJECTIVES</label>
                <textarea
                  value={newEntity.objectives}
                  onChange={e => setNewEntity({ ...newEntity, objectives: e.target.value })}
                  className="w-full bg-bg border border-border-subtle rounded-sm p-2 text-sm text-text-primary focus:border-gold outline-none min-h-[60px]"
                  placeholder="What are they looking for?"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-text-muted text-[10px] font-mono tracking-widest mb-1">HS CODES (COMMA SEPARATED)</label>
                <input
                  value={newEntity.hs_codes}
                  onChange={e => setNewEntity({ ...newEntity, hs_codes: e.target.value })}
                  className="w-full bg-bg border border-border-subtle rounded-sm p-2 text-sm text-text-primary focus:border-gold outline-none"
                  placeholder="e.g. 1006.30, 0713.31"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button
                type="button"
                onClick={() => setShowEntityForm(false)}
                className="text-text-muted font-mono text-[10px] tracking-widest hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-gold text-bg px-6 py-2 rounded-sm font-mono text-[10px] tracking-widest hover:opacity-90"
              >
                Save Entity
              </button>
            </div>
          </form>
        </Card>
      )}

      {/* Matches */}
      <div className="space-y-4">
        <h3 className="text-gold font-mono text-[10px] tracking-[0.2em] uppercase">Active Match Recommendations</h3>
        {matches.map(match => (
          <Card key={match.id} className="group">
            <div className="flex gap-6">
              <div className="flex flex-col items-center justify-center border-2 border-gold/30 rounded-full w-16 h-16 shrink-0 group-hover:border-gold transition-colors">
                <span className="text-gold font-display text-2xl leading-none">{match.score}</span>
                <span className="text-[7px] font-mono text-text-muted tracking-widest">SCORE</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h4 className="text-text-primary text-lg font-display">{(match as any).home_entity_name || match.homeEntity} <span className="text-text-muted italic mx-2">→</span> {(match as any).local_entity_name || match.localEntity}</h4>
                  <StatusBadge status={match.status} />
                </div>
                <p className="text-text-muted text-sm leading-relaxed mb-4">{match.rationale}</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => toggleApproval('match', match.id)}
                    className={`px-4 py-1.5 rounded-sm font-mono text-[10px] tracking-widest transition-all ${approvals[match.id] || match.status === 'actioned'
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                      : 'bg-gold text-bg hover:opacity-90'
                      }`}
                  >
                    {approvals[match.id] || match.status === 'actioned' ? '✓ INTRO SENT' : 'Approve Introduction'}
                  </button>
                  <button className="text-text-muted border border-border-subtle px-4 py-1.5 rounded-sm font-mono text-[10px] tracking-widest hover:border-gold hover:text-gold">View Profile</button>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderScribe = () => (
    <div className="space-y-8 fade-in">
      <SectionHeader title="✦ The Scribe" subtitle="Reporting & Drafting" />

      {/* Commission */}
      <Card className="bg-gold-dim border-gold/20">
        <h3 className="flex items-center justify-between text-gold font-mono text-[10px] tracking-[0.2em] uppercase mb-4">
          <span>Commission a Document</span>
          <select
            value={scribeType}
            onChange={(e) => setScribeType(e.target.value)}
            className="bg-bg border border-gold/20 text-gold text-[10px] rounded-sm px-2 py-1 outline-none font-mono uppercase tracking-widest cursor-pointer hover:bg-surface-elevated transition-colors"
          >
            <option value="report">Policy Report</option>
            <option value="speech">Consul General Speech</option>
          </select>
        </h3>
        <div className="flex gap-3">
          <textarea
            value={scribeInput}
            onChange={(e) => setScribeInput(e.target.value)}
            placeholder={scribeType === 'speech' ? "e.g. 'Draft a 10-minute keynote speech for the Bengal Chamber of Commerce dinner...'" : "e.g. 'Draft a 10-page analysis of the SEZ law. Audience: Myanmar Ministry of Foreign Affairs...'"}
            className="flex-1 bg-surface-elevated border border-gold/20 rounded-sm p-3 text-sm focus:outline-none focus:border-gold transition-colors min-h-[80px]"
          />
          <button
            onClick={commissionTask}
            className="bg-gold text-bg px-6 rounded-sm font-mono text-[10px] tracking-widest hover:opacity-90 transition-opacity"
          >
            Commission
          </button>
        </div>
      </Card>

      {/* Queue */}
      <div className="space-y-4">
        <h3 className="text-gold font-mono text-[10px] tracking-[0.2em] uppercase">Active Drafting Queue</h3>
        {tasks.map(task => (
          <Card key={task.id}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h4 className="text-text-primary text-lg font-display">{task.title}</h4>
                  <StatusBadge status={task.status} />
                </div>
                <p className="text-text-muted text-xs">Audience: {(task as any).payload?.audience || task.audience} · Due {task.due || (task as any).due_at}</p>
              </div>
              <button className="bg-gold text-bg px-4 py-1.5 rounded-sm font-mono text-[10px] tracking-widest hover:opacity-90">
                {task.status === 'delivered' ? 'Review Draft' : 'Preview'}
              </button>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center text-[9px] font-mono text-text-muted tracking-widest">
                <span>PROGRESS</span>
                <span>{task.progress}%</span>
              </div>
              <div className="h-1 bg-surface-elevated rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${task.progress}%` }}
                  className={`h-full ${task.status === 'delivered' ? 'bg-green-500' : 'bg-gold'}`}
                />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );

  const [dbStats, setDbStats] = useState<any>(null);

  useEffect(() => {
    if (activeTab === 'database') {
      fetch('/api/db/diagnostics')
        .then(res => res.json())
        .then(data => setDbStats(data))
        .catch(err => console.error("Error fetching DB stats:", err));
    }
  }, [activeTab]);

  const renderDatabase = () => (
    <div className="space-y-8 fade-in h-40 overflow-y-auto pr-4 custom-scrollbar">
      <SectionHeader title="System Diagnostics" subtitle="Core Database Access" />

      {dbStats ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-surface border border-border-subtle p-4 rounded-md">
              <div className="text-text-muted text-[10px] font-mono uppercase mb-1">Entities</div>
              <div className="text-text-primary text-2xl font-light">{dbStats.stats.entities.count}</div>
            </div>
            <div className="bg-surface border border-border-subtle p-4 rounded-md">
              <div className="text-text-muted text-[10px] font-mono uppercase mb-1">Matches</div>
              <div className="text-text-primary text-2xl font-light">{dbStats.stats.matches.count}</div>
            </div>
            <div className="bg-surface border border-border-subtle p-4 rounded-md">
              <div className="text-text-muted text-[10px] font-mono uppercase mb-1">Intelligence</div>
              <div className="text-text-primary text-2xl font-light">{dbStats.stats.intelligence.count}</div>
            </div>
            <div className="bg-surface border border-border-subtle p-4 rounded-md">
              <div className="text-text-muted text-[10px] font-mono uppercase mb-1">Tasks</div>
              <div className="text-text-primary text-2xl font-light">{dbStats.stats.tasks.count}</div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-gold font-mono text-[10px] tracking-[0.2em] uppercase">Recent Entities</h3>
            <div className="bg-surface border border-border-subtle rounded-md overflow-hidden">
              <table className="w-full text-left text-sm cursor-default">
                <thead className="bg-surface-elevated text-text-muted font-mono text-[10px] uppercase border-b border-border-subtle">
                  <tr>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Sector</th>
                    <th className="px-4 py-3">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {dbStats.data.entities.map((ent: any) => (
                    <tr key={ent.id} className="hover:bg-surface-elevated/50 transition-colors">
                      <td className="px-4 py-3 font-mono text-[10px]"><span className={`px-2 py-0.5 rounded-sm ${ent.type === 'home' ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'}`}>{ent.type}</span></td>
                      <td className="px-4 py-3 font-medium text-text-primary">{ent.name}</td>
                      <td className="px-4 py-3 text-text-muted">{ent.sector}</td>
                      <td className="px-4 py-3 text-text-muted font-mono text-[10px]">{new Date(ent.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-gold font-mono text-[10px] tracking-[0.2em] uppercase">Recent Task Payloads</h3>
            <div className="bg-surface border border-border-subtle rounded-md p-4">
              {dbStats.data.tasks.map((task: any) => (
                <div key={task.id} className="mb-4 last:mb-0">
                  <div className="flex justify-between mb-1">
                    <span className="text-text-primary text-xs font-bold">{task.title}</span>
                    <span className="font-mono text-[9px] text-text-muted">{task.agent} | {task.status}</span>
                  </div>
                  <pre className="bg-bg p-3 rounded-sm border border-border-subtle overflow-x-auto text-[10px] font-mono text-text-muted">
                    {JSON.stringify(JSON.parse(task.payload), null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="p-8 text-center text-text-muted font-mono text-sm loading-pulse">
          Querying SQLite Master...
        </div>
      )}
    </div>
  );

  const renderAttache = () => (
    <div className="space-y-8 fade-in">
      <SectionHeader title="⬡ The Attaché" subtitle={delegation?.name || "UMFCCI Trade Mission to Kolkata"} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column */}
        <div className="space-y-8">

          {/* Daily Appointments */}
          <section className="space-y-4">
            <h3 className="text-gold font-mono text-[10px] tracking-[0.2em] uppercase">Consul General's Daily Appointments</h3>
            <div className="bg-surface border border-border-subtle rounded-md divide-y divide-border-subtle">
              {[
                { time: "09:00", event: "Call with Secretary, Ministry of Commerce", status: "completed" },
                { time: "11:30", event: "Courtesy Call — Mayor of Kolkata", status: "pending" },
                { time: "14:15", event: "Briefing — Chief Minister's Office rep", status: "pending" },
                { time: "16:00", event: "Review — Delegation Speech", status: "pending" }
              ].map((item, i) => (
                <div key={i} className="p-4 flex items-center gap-4 hover:bg-surface-elevated transition-colors">
                  <span className={`font-mono text-xs w-12 ${item.status === 'completed' ? 'text-text-muted line-through opacity-50' : 'text-gold'}`}>{item.time}</span>
                  <div className="flex-1 flex justify-between items-center">
                    <h4 className={`text-sm font-medium ${item.status === 'completed' ? 'text-text-muted opacity-50' : 'text-text-primary'}`}>{item.event}</h4>
                    <StatusBadge status={item.status === 'completed' ? 'delivered' : 'queued'} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Run of Show */}
          <section className="space-y-4">
            <h3 className="text-gold font-mono text-[10px] tracking-[0.2em] uppercase">Delegation Run-of-Show</h3>
            <div className="bg-surface border border-border-subtle rounded-md divide-y divide-border-subtle">
              {delegation?.schedule?.map((item: any, i: number) => (
                <div key={i} className={`p-4 flex gap-4 ${item.status === 'alert' ? 'bg-orange-500/5' : ''}`}>
                  <span className="text-gold font-mono text-xs w-12">{item.time}</span>
                  <div className="flex-1">
                    <h4 className="text-text-primary text-sm font-medium mb-1">{item.event}</h4>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={item.status === 'alert' ? 'urgent' : 'ready'} />
                      <span className="text-text-muted font-mono text-[9px]">{item.agent}</span>
                    </div>
                    {item.status === 'alert' && item.alert_reason && (
                      <div className="mt-3">
                        <p className="text-orange-400 text-[10px] mb-2">⚠ {item.alert_reason}</p>
                        <button className="bg-orange-500 text-bg px-3 py-1 rounded-sm font-mono text-[9px] tracking-widest">Resolve Conflict</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end mt-4">
              <button
                onClick={async () => {
                  try {
                    await fetch('/api/agents/attache/run');
                    const res = await fetch('/api/delegation/chamber-2025');
                    const data = await res.json();
                    setDelegation(data);
                  } catch (error) {
                    console.error("Error running attache:", error);
                  }
                }}
                className="bg-gold text-bg px-4 py-2 rounded-sm font-mono text-[10px] tracking-widest hover:opacity-90"
              >
                Run Logistics Review
              </button>
            </div>
          </section>
        </div>

        <div className="space-y-8">
          {/* Members */}
          <section className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-gold font-mono text-[10px] tracking-[0.2em] uppercase">Delegation Members</h3>
              <span className="text-text-muted font-mono text-[9px]">{delegation?.members?.length} Members · {delegation?.briefing_progress}% Briefed</span>
            </div>
            <div className="space-y-2">
              {delegation?.members?.map((member: any, i: number) => (
                <Card key={i} className="py-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="text-text-primary text-sm font-medium">{member.name}</h4>
                      <p className="text-text-muted text-xs">{member.company}</p>
                    </div>
                    <StatusBadge status={member.briefed ? 'delivered' : 'queued'} />
                  </div>
                </Card>
              ))}
              <div className="p-4 bg-gold-dim border border-gold/20 rounded-md">
                <p className="text-gold font-mono text-[9px] tracking-widest mb-1 uppercase">✦ Scribe Note</p>
                <p className="text-text-muted text-[11px] leading-relaxed italic">
                  "Only you can write this: Please provide a personal assessment of the bilateral mood for the briefing book."
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-bg text-text-primary flex flex-col">
      {/* Top Navigation Bar */}
      <header className="h-16 border-b border-border-subtle bg-bg/80 backdrop-blur-md sticky top-0 z-50 px-6 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div className="flex items-baseline gap-2">
            <h1 className="text-gold text-2xl font-display tracking-wider">ENVOY</h1>
            <span className="text-text-muted font-mono text-[8px] tracking-[0.3em] uppercase hidden sm:inline">Economic Navigator</span>
          </div>

          <nav className="hidden md:flex items-center gap-1">
            {[
              { id: 'consul', label: 'Consul', icon: <Shield className="w-3 h-3" /> },
              { id: 'sentinel', label: 'Sentinel', icon: <Search className="w-3 h-3" />, alertCount: legalAlerts.length },
              { id: 'attache', label: 'Attaché', icon: <Users className="w-3 h-3" /> },
              { id: 'connector', label: 'Connector', icon: <LinkIcon className="w-3 h-3" /> },
              { id: 'scribe', label: 'Scribe', icon: <FileText className="w-3 h-3" /> },
              { id: 'database', label: 'Database', icon: <Database className="w-3 h-3" /> },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-sm transition-all relative ${activeTab === tab.id
                  ? 'text-gold bg-gold-dim'
                  : 'text-text-muted hover:text-text-primary hover:bg-surface-elevated'
                  }`}
              >
                {tab.icon}
                <span className="font-mono text-[10px] tracking-widest uppercase">{tab.label}</span>
                {tab.alertCount ? (
                  <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                ) : null}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-gold font-mono text-xs leading-none">07:15</p>
            <p className="text-text-muted font-mono text-[8px] tracking-widest uppercase">Monday</p>
          </div>
          <div className="w-8 h-8 rounded-full bg-gold-dim border border-gold/30 flex items-center justify-center text-gold font-display text-sm">
            D
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            {activeTab === 'consul' && renderConsul()}
            {activeTab === 'sentinel' && renderSentinel()}
            {activeTab === 'connector' && renderConnector()}
            {activeTab === 'scribe' && renderScribe()}
            {activeTab === 'attache' && renderAttache()}
            {activeTab === 'database' && renderDatabase()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Footer Status Bar */}
      <footer className="h-10 border-t border-border-subtle bg-bg px-6 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Activity className="w-3 h-3 text-green-500 animate-pulse-soft" />
            <span className="text-text-muted font-mono text-[9px] tracking-widest uppercase">Agents Online: 5/6</span>
          </div>
          <div className="flex items-center gap-2">
            <Bell className="w-3 h-3 text-gold" />
            <span className="text-text-muted font-mono text-[9px] tracking-widest uppercase">Pending Approvals: 4</span>
          </div>
        </div>
        <div className="text-text-muted font-mono text-[8px] tracking-[0.2em] uppercase">
          Envoy v1.0 Prototype · Internal Reference Only
        </div>
      </footer>
    </div>
  );
}

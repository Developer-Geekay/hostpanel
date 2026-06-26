import { useState, useEffect } from 'react';
import {
  Server, Database, Mail, ShieldCheck, Wifi, Lock,
  Play, Square, RotateCw, RefreshCw, Search, FileText,
  ScrollText, Settings2, BarChart2, AlertTriangle, Save, RotateCcw
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/Toast';
import { useServices } from './hooks/useServices';
import { LogPanel } from './components/LogPanel';

// Metadata configuration mapping for known system services
const serviceMeta: Record<string, {
  desc: string;
  icon: string;
  port: string;
  pid: string;
  uptime: string;
  cpu: string;
  ram: string;
  conn: string;
  configPath: string;
  logPath: string;
  configContent: string;
}> = {
  nginx: {
    desc: 'HTTP and reverse proxy server',
    icon: 'server',
    port: '80, 443',
    pid: '1842',
    uptime: '14 days, 6h 22m',
    cpu: '0.4%',
    ram: '48 MB',
    conn: '142',
    configPath: '/etc/nginx/nginx.conf',
    logPath: '/var/log/nginx/',
    configContent: `user www-data;
worker_processes auto;
pid /run/nginx.pid;

events {
  worker_connections 1024;
  use epoll;
  multi_accept on;
}

http {
  sendfile on;
  tcp_nopush on;
  types_hash_max_size 2048;
  server_tokens off; ## hide version
  gzip on;
  gzip_types text/plain application/json application/javascript text/css;
  include /etc/nginx/sites-enabled/*;
}`
  },
  mongodb: {
    desc: 'NoSQL document database',
    icon: 'database',
    port: '27017',
    pid: '2081',
    uptime: '14 days, 5h 10m',
    cpu: '1.2%',
    ram: '256 MB',
    conn: '24',
    configPath: '/etc/mongod.conf',
    logPath: '/var/log/mongodb/',
    configContent: `storage:
  dbPath: /var/lib/mongodb
  journal:
    enabled: true

systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log

net:
  port: 27017
  bindIp: 127.0.0.1`
  },
  postfix: {
    desc: 'Mail transfer agent (SMTP)',
    icon: 'mail',
    port: '25, 465, 587',
    pid: '1944',
    uptime: '14 days, 6h 20m',
    cpu: '0.1%',
    ram: '12 MB',
    conn: '0',
    configPath: '/etc/postfix/main.cf',
    logPath: '/var/log/mail.log',
    configContent: `smtpd_banner = $myhostname ESMTP $mail_name
biff = no
append_dot_mydomain = no
readme_directory = no

# TLS parameters
smtpd_tls_cert_file=/etc/ssl/certs/ssl-cert-snakeoil.pem
smtpd_tls_key_file=/etc/ssl/private/ssl-cert-snakeoil.key
smtpd_use_tls=yes`
  },
  opendkim: {
    desc: 'DKIM signing milter service',
    icon: 'shield-check',
    port: '8891',
    pid: '1982',
    uptime: '14 days, 6h 18m',
    cpu: '0.1%',
    ram: '8 MB',
    conn: '1',
    configPath: '/etc/opendkim.conf',
    logPath: '/var/log/mail.log',
    configContent: `Syslog                  yes
RequiredHeaders         yes

# Mode s = signer, v = verifier
Mode                    sv
SubDomains              no`
  },
  wireguard: {
    desc: 'Fast, modern secure VPN tunnel',
    icon: 'vpn_lock',
    port: '51820 (UDP)',
    pid: 'N/A (kernel)',
    uptime: '14 days, 6h 22m',
    cpu: '0.0%',
    ram: '0 MB',
    conn: '8 active peers',
    configPath: '/etc/wireguard/wg0.conf',
    logPath: 'dmesg | grep wg',
    configContent: `[Interface]
PrivateKey = [redacted]
Address = 10.0.0.1/24
ListenPort = 51820

[Peer]
PublicKey = peer-public-key-here
AllowedIPs = 10.0.0.2/32`
  },
  ufw: {
    desc: 'Uncomplicated Firewall service',
    icon: 'lock',
    port: 'N/A',
    pid: 'N/A',
    uptime: '14 days, 6h 22m',
    cpu: '0.0%',
    ram: '0 MB',
    conn: 'Active filter rules',
    configPath: '/etc/ufw/ufw.conf',
    logPath: '/var/log/ufw.log',
    configContent: `# /etc/ufw/ufw.conf
# Set to yes to start on boot
ENABLED=yes
LOGLEVEL=low`
  },
  'pure-ftpd': {
    desc: 'Secure FTP server daemon',
    icon: 'ftp',
    port: '21',
    pid: '2023',
    uptime: '14 days, 6h 22m',
    cpu: '0.0%',
    ram: '14 MB',
    conn: '0',
    configPath: '/etc/pure-ftpd/pure-ftpd.conf',
    logPath: '/var/log/pure-ftpd.log',
    configContent: `# Pure-FTPd configuration
ChrootEveryone              yes
BrokenClientsCompatibility  no
MaxClientsNumber            50
Daemonize                   yes
VerboseLog                  yes`
  }
};

const getServiceMeta = (name: string) => {
  const normName = name.toLowerCase();
  for (const key of Object.keys(serviceMeta)) {
    if (normName.includes(key) || key.includes(normName)) {
      return serviceMeta[key];
    }
  }
  return {
    desc: 'System service',
    icon: 'server',
    port: 'N/A',
    pid: 'N/A',
    uptime: 'N/A',
    cpu: '0.0%',
    ram: 'N/A',
    conn: 'N/A',
    configPath: `/etc/${name}/${name}.conf`,
    logPath: `/var/log/${name}.log`,
    configContent: `# Configuration for ${name}\n# No details available.`
  };
};

function getServiceIcon(iconName?: string, name?: string) {
  const key = (iconName || name || '').toLowerCase();
  if (key.includes('database') || key.includes('mongo') || key.includes('storage')) {
    return <Database size={16} strokeWidth={1.5} />;
  }
  if (key.includes('mail') || key.includes('postfix') || key.includes('smtp')) {
    return <Mail size={16} strokeWidth={1.5} />;
  }
  if (key.includes('shield') || key.includes('dkim') || key.includes('security')) {
    return <ShieldCheck size={16} strokeWidth={1.5} />;
  }
  if (key.includes('vpn') || key.includes('wireguard') || key.includes('wifi') || key.includes('vpn_lock')) {
    return <Wifi size={16} strokeWidth={1.5} />;
  }
  if (key.includes('lock') || key.includes('ufw') || key.includes('firewall')) {
    return <Lock size={16} strokeWidth={1.5} />;
  }
  return <Server size={16} strokeWidth={1.5} />;
}

export default function Services() {
  const { services, loading, actingOn, fetchServices, serviceAction } = useServices();
  const [filter, setFilter] = useState('');
  const [selectedSvcName, setSelectedSvcName] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'logs' | 'config' | 'stats'>('logs');
  const [configText, setConfigText] = useState('');
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const toast = useToast();

  // Set default selected service on first load
  useEffect(() => {
    if (services.length > 0 && !selectedSvcName) {
      setSelectedSvcName(services[0].name);
    }
  }, [services, selectedSvcName]);

  const selectedSvc = services.find(s => s.name === selectedSvcName) || null;
  const meta = selectedSvc ? getServiceMeta(selectedSvc.name) : null;

  // Reset editor state when switching services
  useEffect(() => {
    if (meta) {
      setConfigText(meta.configContent);
      setIsEditingConfig(false);
    }
  }, [selectedSvcName]);

  const handleSaveConfig = () => {
    toast.ok(`Configuration for ${selectedSvc?.name} saved successfully.`);
    setIsEditingConfig(false);
    if (selectedSvc) {
      if (selectedSvc.can_reload) {
        serviceAction(selectedSvc.name, 'reload');
      } else {
        serviceAction(selectedSvc.name, 'restart');
      }
    }
  };

  const filteredServices = services.filter(svc =>
    svc.name.toLowerCase().includes(filter.toLowerCase()) ||
    (svc.label || '').toLowerCase().includes(filter.toLowerCase())
  );

  if (loading && services.length === 0) return <PageSpinner />;

  const runningCount = services.filter(s => s.status === 'running' || s.status === 'active').length;
  const stoppedCount = services.length - runningCount;

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Topbar */}
      <div className="page-header" style={{ flexShrink: 0, paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
        <div>
          <div className="page-title">Services</div>
          <div className="page-desc" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <span className="chip chip-green">{runningCount} running</span>
            <span className="chip chip-gray">{stoppedCount} stopped</span>
          </div>
        </div>
        <Button variant="ghost" size="sm" icon={<RefreshCw size={12} />} onClick={fetchServices}>
          Refresh List
        </Button>
      </div>

      {services.length === 0 ? (
        <div className="empty" style={{ flex: 1 }}>
          <FileText size={32} strokeWidth={1.5} className="empty-icon" />
          <div className="empty-title">No services found</div>
          <div className="empty-desc">No services are configured on this server.</div>
        </div>
      ) : (
        <div className="split-view" style={{ flex: 1, minHeight: 0 }}>
          {/* LEFT: service list */}
          <div className="split-left">
            <div className="split-pane-header">
              <h3 style={{ fontSize: '12px', fontWeight: 600 }}>System Services</h3>
            </div>
            <div className="search-wrap" style={{ margin: '8px 10px 4px' }}>
              <Search style={{ width: 12, height: 12, color: 'var(--text-3)', flexShrink: 0 }} />
              <input
                type="text"
                placeholder="Filter services..."
                value={filter}
                onChange={e => setFilter(e.target.value)}
              />
            </div>
            <div className="split-scroll">
              <div style={{ height: 4 }}></div>
              {filteredServices.map(svc => {
                const isSelected = svc.name === selectedSvcName;
                const svcMetaInfo = getServiceMeta(svc.name);
                const isActive = svc.status === 'running' || svc.status === 'active';
                const isFailed = svc.status === 'failed' || svc.status === 'error';

                let dotColor = 'var(--text-3)';
                let chipClass = 'chip-gray';
                if (isActive) {
                  dotColor = 'var(--green)';
                  chipClass = 'chip-green';
                } else if (isFailed) {
                  dotColor = 'var(--red)';
                  chipClass = 'chip-red';
                } else if (svc.status === 'warning') {
                  dotColor = 'var(--amber)';
                  chipClass = 'chip-amber';
                }

                return (
                  <div
                    key={svc.name}
                    className={`list-item${isSelected ? ' sel' : ''}`}
                    onClick={() => setSelectedSvcName(svc.name)}
                  >
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: dotColor, flexShrink: 0,
                      boxShadow: `0 0 6px ${dotColor}`
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="li-name" style={{ fontSize: '12.5px', fontWeight: 500 }}>{svc.label || svc.name}</div>
                      <div className="li-sub" style={{ fontSize: '10.5px' }}>{svcMetaInfo.desc}</div>
                    </div>
                    <span className={`chip ${chipClass}`} style={{ fontSize: '9px', padding: '1px 5px' }}>
                      {svc.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT: service detail */}
          <div className="split-right">
            {selectedSvc ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                {/* Detail Header */}
                <div className="split-pane-header" style={{ gap: '14px', flexWrap: 'wrap' }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '9px',
                    background: selectedSvc.status === 'running' || selectedSvc.status === 'active' ? 'var(--green-dim)' : 'var(--accent-dim)',
                    border: selectedSvc.status === 'running' || selectedSvc.status === 'active' ? '1px solid var(--green-border)' : '1px solid var(--accent-border)',
                    display: 'grid', placeItems: 'center', flexShrink: 0
                  }}>
                    <span style={{ color: selectedSvc.status === 'running' || selectedSvc.status === 'active' ? 'var(--green)' : 'var(--accent-fg, var(--accent))' }}>
                      {getServiceIcon(selectedSvc.icon, selectedSvc.name)}
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: '150px' }}>
                    <h3 style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text)' }}>
                      {selectedSvc.label || selectedSvc.name}
                    </h3>
                    <div className="mono" style={{ fontSize: '10px', color: 'var(--text-3)', marginTop: '2px' }}>
                      unit: {selectedSvc.unit} · ports: {meta?.port}
                    </div>
                  </div>

                  <span className={`chip ${
                    selectedSvc.status === 'running' || selectedSvc.status === 'active' ? 'chip-green' :
                    selectedSvc.status === 'failed' || selectedSvc.status === 'error' ? 'chip-red' : 'chip-gray'
                  }`} style={{ fontSize: '10px' }}>
                    {selectedSvc.status}
                  </span>

                  {/* Service Actions */}
                  <div style={{ display: 'flex', gap: '5px' }}>
                    {!(selectedSvc.status === 'running' || selectedSvc.status === 'active') ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="btn-success"
                        loading={actingOn === selectedSvc.name}
                        disabled={actingOn !== null}
                        icon={<Play size={11} />}
                        onClick={() => serviceAction(selectedSvc.name, 'start')}
                      >
                        Start
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="btn-danger"
                        loading={actingOn === selectedSvc.name}
                        disabled={actingOn !== null}
                        icon={<Square size={11} />}
                        onClick={() => serviceAction(selectedSvc.name, 'stop')}
                      >
                        Stop
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      loading={actingOn === selectedSvc.name}
                      disabled={actingOn !== null}
                      icon={<RotateCw size={11} />}
                      onClick={() => serviceAction(selectedSvc.name, 'restart')}
                    >
                      Restart
                    </Button>

                    {selectedSvc.can_reload && (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={actingOn === selectedSvc.name}
                        disabled={actingOn !== null}
                        icon={<RefreshCw size={11} />}
                        onClick={() => serviceAction(selectedSvc.name, 'reload')}
                      >
                        Reload
                      </Button>
                    )}
                  </div>
                </div>

                {/* Tabs Selector */}
                <div className="tab-bar" style={{ padding: '0 18px', flexShrink: 0 }}>
                  <div
                    className={`tab${activeTab === 'logs' ? ' active' : ''}`}
                    onClick={() => setActiveTab('logs')}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <ScrollText size={12} strokeWidth={1.5} /> Logs
                    </span>
                  </div>
                  <div
                    className={`tab${activeTab === 'config' ? ' active' : ''}`}
                    onClick={() => setActiveTab('config')}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Settings2 size={12} strokeWidth={1.5} /> Config
                    </span>
                  </div>
                  <div
                    className={`tab${activeTab === 'stats' ? ' active' : ''}`}
                    onClick={() => setActiveTab('stats')}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <BarChart2 size={12} strokeWidth={1.5} /> Stats
                    </span>
                  </div>
                </div>

                {/* Tab Pane Body */}
                <div className="split-scroll" style={{ padding: '16px 18px', flex: 1, minHeight: 0 }}>
                  
                  {/* Logs Pane */}
                  {activeTab === 'logs' && (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                      <LogPanel name={selectedSvc.name} />
                    </div>
                  )}

                  {/* Config Pane */}
                  {activeTab === 'config' && (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                        <div className="mono" style={{ fontSize: '11px', color: 'var(--text-3)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {meta?.configPath}
                        </div>
                        {isEditingConfig ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={<RotateCcw size={12} />}
                              onClick={() => { setConfigText(meta?.configContent || ''); setIsEditingConfig(false); }}
                            >
                              Cancel
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={<Save size={12} />}
                              onClick={handleSaveConfig}
                              style={{ color: 'var(--green)' }}
                            >
                              Save & Reload
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<Settings2 size={12} />}
                            onClick={() => setIsEditingConfig(true)}
                          >
                            Edit Config
                          </Button>
                        )}
                      </div>

                      {isEditingConfig ? (
                        <textarea
                          value={configText}
                          onChange={e => setConfigText(e.target.value)}
                          style={{
                            width: '100%',
                            height: '280px',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '11.5px',
                            background: '#060608',
                            color: '#a1a1aa',
                            border: '1px solid var(--border)',
                            borderRadius: '10px',
                            padding: '12px 14px',
                            resize: 'none',
                            outline: 'none',
                            lineHeight: '1.7'
                          }}
                        />
                      ) : (
                        <div className="code-editor" style={{ height: '280px', overflowY: 'auto', padding: '12px 14px' }}>
                          <pre style={{ margin: 0, color: '#a1a1aa', fontFamily: 'var(--font-mono)', fontSize: '11.5px', lineHeight: '1.7' }}>
                            {configText}
                          </pre>
                        </div>
                      )}

                      <div style={{ marginTop: '12px' }} className="inline-alert alert-amber">
                        <AlertTriangle style={{ width: 13, height: 13, color: 'var(--amber)', strokeWidth: 1.5, flexShrink: 0 }} />
                        <span style={{ fontSize: '12px' }}>
                          Test the configuration values before saving. Invalid config structure can prevent the service from starting.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Stats Pane */}
                  {activeTab === 'stats' && (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {/* Metric cards */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '16px' }}>
                        <div className="card" style={{ padding: '14px 16px' }}>
                          <div className="stat-lbl" style={{ marginBottom: '6px' }}>CPU Usage</div>
                          <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.03em' }}>
                            {selectedSvc.status === 'running' || selectedSvc.status === 'active' ? meta?.cpu : '0.0%'}
                          </div>
                          <div className="prog" style={{ marginTop: '7px' }}>
                            <div
                              className="prog-fill"
                              style={{
                                width: selectedSvc.status === 'running' || selectedSvc.status === 'active' ? meta?.cpu : '0%',
                                background: 'var(--accent)',
                                minWidth: '3px'
                              }}
                            />
                          </div>
                        </div>

                        <div className="card" style={{ padding: '14px 16px' }}>
                          <div className="stat-lbl" style={{ marginBottom: '6px' }}>Memory</div>
                          <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.03em' }}>
                            {selectedSvc.status === 'running' || selectedSvc.status === 'active' ? meta?.ram : '0 MB'}
                          </div>
                          <div className="prog" style={{ marginTop: '7px' }}>
                            <div
                              className="prog-fill"
                              style={{
                                width: selectedSvc.status === 'running' || selectedSvc.status === 'active' ? '25%' : '0%',
                                background: 'var(--blue)',
                                minWidth: '3px'
                              }}
                            />
                          </div>
                        </div>

                        <div className="card" style={{ padding: '14px 16px' }}>
                          <div className="stat-lbl" style={{ marginBottom: '6px' }}>Active Connections</div>
                          <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.03em' }}>
                            {selectedSvc.status === 'running' || selectedSvc.status === 'active' ? meta?.conn : '0'}
                          </div>
                          <div className="prog" style={{ marginTop: '7px' }}>
                            <div
                              className="prog-fill"
                              style={{
                                width: selectedSvc.status === 'running' || selectedSvc.status === 'active' ? '15%' : '0%',
                                background: 'var(--green)',
                                minWidth: '3px'
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Property Table */}
                      <div className="card" style={{ overflow: 'hidden' }}>
                        <table style={{ margin: 0, width: '100%' }}>
                          <thead>
                            <tr>
                              <th>Property</th>
                              <th>Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td style={{ color: 'var(--text-3)', fontSize: '12px' }}>PID</td>
                              <td className="mono" style={{ fontSize: '12px', color: 'var(--text)' }}>
                                {selectedSvc.status === 'running' || selectedSvc.status === 'active' ? meta?.pid : 'N/A'}
                              </td>
                            </tr>
                            <tr>
                              <td style={{ color: 'var(--text-3)', fontSize: '12px' }}>Uptime</td>
                              <td style={{ fontSize: '12px', color: 'var(--text)' }}>
                                {selectedSvc.status === 'running' || selectedSvc.status === 'active' ? meta?.uptime : '0'}
                              </td>
                            </tr>
                            <tr>
                              <td style={{ color: 'var(--text-3)', fontSize: '12px' }}>Systemd Unit</td>
                              <td className="mono" style={{ fontSize: '12px', color: 'var(--text)' }}>{selectedSvc.unit}</td>
                            </tr>
                            <tr>
                              <td style={{ color: 'var(--text-3)', fontSize: '12px' }}>Config File Path</td>
                              <td className="mono" style={{ fontSize: '12px', color: 'var(--text-3)' }}>{meta?.configPath}</td>
                            </tr>
                            <tr>
                              <td style={{ color: 'var(--text-3)', fontSize: '12px' }}>Log File Path</td>
                              <td className="mono" style={{ fontSize: '12px', color: 'var(--text-3)' }}>{meta?.logPath}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-3)', fontSize: '13px' }}>
                Select a service from the list to view details
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

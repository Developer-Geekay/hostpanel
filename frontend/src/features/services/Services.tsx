import { RefreshCw, FileText } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';
import { useServices } from './hooks/useServices';
import { ServiceRow } from './components/ServiceRow';

export default function Services() {
  const { services, loading, actingOn, expandedLog, fetchServices, serviceAction, toggleLog } = useServices();

  if (loading) return <PageSpinner />;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Services</div>
          <div className="page-desc">Manage system services</div>
        </div>
        <Button variant="ghost" size="sm" icon={<RefreshCw size={13} strokeWidth={1.5} />} onClick={fetchServices}>
          Refresh
        </Button>
      </div>

      {services.length === 0 ? (
        <div className="empty">
          <FileText size={32} strokeWidth={1.5} className="empty-icon" />
          <div className="empty-title">No services found</div>
          <div className="empty-desc">No services are configured on this server.</div>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Service</th>
                <th>Status</th>
                <th>Unit</th>
                <th>Actions</th>
                <th>Logs</th>
              </tr>
            </thead>
            <tbody>
              {services.map(svc => (
                <ServiceRow
                  key={svc.name}
                  svc={svc}
                  busy={actingOn === svc.name}
                  logOpen={expandedLog === svc.name}
                  onAction={serviceAction}
                  onToggleLog={toggleLog}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

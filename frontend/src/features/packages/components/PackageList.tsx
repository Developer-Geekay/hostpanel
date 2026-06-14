import { Package, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import type { PackageItem } from '../types';

interface Props {
  packages: PackageItem[];
  restarting: boolean;
  onUpdate: (pkg: PackageItem) => void;
  onUninstall: (pkg: PackageItem) => void;
}

export function PackageList({ packages, restarting, onUpdate, onUninstall }: Props) {
  if (packages.length === 0) {
    return (
      <div className="empty">
        <Package size={32} strokeWidth={1.5} className="empty-icon" />
        <div className="empty-title">No packages installed</div>
        <div className="empty-desc">Install packages to extend HostPanel functionality.</div>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Version</th>
            <th>Description</th>
            <th>Status</th>
            <th>Service</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {packages.map(pkg => (
            <tr key={pkg.name}>
              <td style={{ fontWeight: 500, color: 'var(--text)' }}>{pkg.name}</td>
              <td className="mono">{pkg.version}</td>
              <td style={{ color: 'var(--text-2)', maxWidth: 300 }}>{pkg.description}</td>
              <td>
                {pkg.compatible
                  ? <span className="badge badge-ok">Compatible</span>
                  : <span className="badge badge-warn">Incompatible</span>
                }
              </td>
              <td className="mono" style={{ fontSize: 11.5, color: 'var(--text-2)' }}>
                {pkg.service && typeof pkg.service === 'object' ? pkg.service.name : (pkg.service ?? '—')}
              </td>
              <td>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<RefreshCw size={12} strokeWidth={1.5} />}
                    onClick={() => onUpdate(pkg)}
                    title="Update package"
                    disabled={restarting}
                  >
                    Update
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    icon={<Trash2 size={12} strokeWidth={1.5} />}
                    onClick={() => onUninstall(pkg)}
                    disabled={restarting}
                  >
                    Uninstall
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

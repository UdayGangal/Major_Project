
const NAVIGATION = [
  {
    id: 'overview',
    label: 'Overview',
    icon: 'grid',
    heading: 'WORKSPACE'
  },
  {
    id: 'rolling',
    label: 'Rolling Update',
    icon: 'refresh',
    heading: 'DEPLOYMENT STRATEGIES',
    badge: 'TRACKED'
  },
  {
    id: 'recreate',
    label: 'Recreate',
    icon: 'layers',
    heading: 'DEPLOYMENT STRATEGIES',
    badge: 'RECORDED'
  },
  {
    id: 'blue-green',
    label: 'Blue-Green',
    icon: 'split',
    heading: 'DEPLOYMENT STRATEGIES',
    badge: 'SETUP'
  },
  {
    id: 'canary',
    label: 'Canary',
    icon: 'target',
    heading: 'DEPLOYMENT STRATEGIES',
    badge: 'PLANNED'
  }
];

function NavIcon({ name }) {
  const common = {
    width: 19,
    height: 19,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
  };

  switch (name) {
    case 'grid':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="8" height="8" rx="2" />
          <rect x="13" y="3" width="8" height="8" rx="2" />
          <rect x="3" y="13" width="8" height="8" rx="2" />
          <rect x="13" y="13" width="8" height="8" rx="2" />
        </svg>
      );

    case 'refresh':
      return (
        <svg {...common}>
          <path d="M20 7v5h-5" />
          <path d="M4 17v-5h5" />
          <path d="M5.6 9a7 7 0 0 1 11.6-2L20 12" />
          <path d="M4 12l2.8 5a7 7 0 0 0 11.6-2" />
        </svg>
      );

    case 'layers':
      return (
        <svg {...common}>
          <path d="m12 3 9 5-9 5-9-5 9-5Z" />
          <path d="m3 12 9 5 9-5" />
          <path d="m3 16 9 5 9-5" />
        </svg>
      );

    case 'split':
      return (
        <svg {...common}>
          <path d="M6 3v5a4 4 0 0 0 4 4h4a4 4 0 0 1 4 4v5" />
          <path d="m14 7 4-4 4 4" />
          <path d="m14 17 4 4 4-4" />
        </svg>
      );

    case 'target':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1" />
        </svg>
      );

    default:
      return null;
  }
}

export default function Sidebar({ activePage, onNavigate }) {
  let previousHeading = '';

  return (
    <aside className="sidebar">

      <div className="sidebar-brand">
        <div className="brand-logo">D</div>

        <div className="brand-text">
          <h2>DeployOps</h2>
          <span>DEPLOYMENT CONTROL</span>
        </div>
      </div>

      <div className="sidebar-divider" />

      <nav className="sidebar-navigation">

        {NAVIGATION.map(item => {
          const showHeading = item.heading !== previousHeading;
          previousHeading = item.heading;

          return (
            <div key={item.id}>

              {showHeading && (
                <p className="nav-section-heading">
                  {item.heading}
                </p>
              )}

              <button
                type="button"
                className={`nav-item ${
                  activePage === item.id ? 'active' : ''
                }`}
                onClick={() => onNavigate(item.id)}
                aria-current={
                  activePage === item.id ? 'page' : undefined
                }
              >
                <span className="nav-item-icon">
                  <NavIcon name={item.icon} />
                </span>

                <span className="nav-item-label">
                  {item.label}
                </span>

                {item.badge && (
                  <span className={`nav-badge badge-${item.id}`}>
                    {item.badge}
                  </span>
                )}
              </button>

            </div>
          );
        })}

      </nav>

      <div className="sidebar-bottom">

        <div className="sidebar-divider" />

        <div className="sidebar-project">
          <div className="project-icon">K8s</div>

          <div className="project-info">
            <strong>Cloud Native Research</strong>
            <span>Major Project · 2026–27</span>
          </div>
        </div>

        <div className="sidebar-version">
          <span className="version-dot" />
          Deployment Research Platform
        </div>

      </div>

    </aside>
  );
}

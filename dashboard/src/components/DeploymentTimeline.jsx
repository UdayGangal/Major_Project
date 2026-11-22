
const TIMELINES = {
  rolling: {
    title: 'Rolling Update Lifecycle',
    subtitle: 'Gradual replacement of application Pods',
    mode: 'WORKFLOW VIEW',
    stages: [
      {
        title: 'V1 Pods serving traffic',
        description: 'Existing application replicas handle incoming requests.',
        icon: '01',
        status: 'Stable'
      },
      {
        title: 'Create V2 Pod',
        description: 'Kubernetes creates a new Pod while retaining existing capacity.',
        icon: '02',
        status: 'In progress'
      },
      {
        title: 'Readiness validation',
        description: 'The new Pod must pass its readiness probe.',
        icon: '03',
        status: 'Health check'
      },
      {
        title: 'Terminate old V1 Pod',
        description: 'An old Pod is removed after the replacement is ready.',
        icon: '04',
        status: 'Replacement'
      },
      {
        title: 'All replicas updated',
        description: 'The Deployment reaches the desired V2 replica count.',
        icon: '05',
        status: 'Completed'
      }
    ],
    note: 'This shows the configured Rolling Update lifecycle. Individual event timestamps are not currently collected.'
  },

  recreate: {
    title: 'Recreate Deployment Timeline',
    subtitle: 'V1 termination followed by V2 replacement',
    mode: 'RECORDED EXPERIMENT',
    date: '20 November 2026',
    duration: '196.87 seconds',
    start: '21:48:27',
    end: '21:51:44',
    stages: [
      {
        title: 'V1 workload active',
        description: 'Four V1 Pods were ready and k6 was generating traffic with 20 virtual users.',
        icon: '01',
        status: 'Baseline'
      },
      {
        title: 'V2 deployment initiated',
        description: 'The V2 Deployment manifest was applied to Kubernetes.',
        icon: '02',
        time: '21:48:27',
        status: 'Recorded'
      },
      {
        title: 'Recreate replacement phase',
        description: 'Old V1 Pods were terminated before the new V2 Pods became ready.',
        icon: '03',
        status: 'Transition'
      },
      {
        title: 'V2 rollout completed',
        description: 'Kubernetes reported a successful rollout. Four V2 Pods became ready.',
        icon: '04',
        time: '21:51:44',
        status: 'Recorded'
      }
    ],
    note: 'Only the deployment start and completion timestamps were recorded. The exact duration of the no-ready-Pod interval was not measured separately.'
  },

  'blue-green': {
    title: 'Blue-Green Deployment Lifecycle',
    subtitle: 'Two environments with controlled service switching',
    mode: 'IMPLEMENTATION PENDING',
    stages: [
      {
        title: 'Blue environment active',
        description: 'The current application environment serves traffic.',
        icon: '01',
        status: 'Planned'
      },
      {
        title: 'Deploy Green environment',
        description: 'A second environment is prepared with the new version.',
        icon: '02',
        status: 'Planned'
      },
      {
        title: 'Validate Green',
        description: 'Health checks verify the new application environment.',
        icon: '03',
        status: 'Planned'
      },
      {
        title: 'Switch Service selector',
        description: 'Traffic is directed from Blue to Green.',
        icon: '04',
        status: 'Planned'
      },
      {
        title: 'Rollback availability',
        description: 'The old environment remains available for rollback.',
        icon: '05',
        status: 'Planned'
      }
    ],
    note: 'This is the expected workflow. Actual Blue-Green event data will be added after the experiment.'
  },

  canary: {
    title: 'Canary Deployment Lifecycle',
    subtitle: 'Progressive traffic exposure and validation',
    mode: 'PLANNED IMPLEMENTATION',
    stages: [
      {
        title: 'Deploy stable V1 and candidate V2',
        description: 'Both versions are deployed into the cluster.',
        icon: '01',
        status: 'Planned'
      },
      {
        title: 'Initial traffic allocation',
        description: 'A small percentage of traffic reaches V2.',
        icon: '02',
        status: 'Planned'
      },
      {
        title: 'Observe runtime metrics',
        description: 'Error rate, latency and health are monitored.',
        icon: '03',
        status: 'Planned'
      },
      {
        title: 'Promote or hold',
        description: 'Traffic increases only when configured conditions are satisfied.',
        icon: '04',
        status: 'Planned'
      },
      {
        title: 'Complete or rollback',
        description: 'The release is completed or traffic returns to V1.',
        icon: '05',
        status: 'Planned'
      }
    ],
    note: 'Adaptive traffic decisions and Istio integration are planned future implementation work.'
  }
};

export default function DeploymentTimeline({ strategy = 'rolling' }) {
  const timeline = TIMELINES[strategy];

  if (!timeline) return null;

  const isRecorded = strategy === 'recreate';

  return (
    <section className="panel deployment-timeline">

      <div className="panel-heading timeline-heading">
        <div>
          <p className="panel-kicker">DEPLOYMENT OBSERVABILITY</p>
          <h2>{timeline.title}</h2>
          <p className="timeline-subtitle">
            {timeline.subtitle}
          </p>
        </div>

        <span className={`timeline-mode ${isRecorded ? 'recorded' : ''}`}>
          {timeline.mode}
        </span>
      </div>

      {isRecorded && (
        <div className="timeline-summary">

          <div className="timeline-summary-card">
            <span>ROLLOUT DURATION</span>
            <strong>{timeline.duration}</strong>
          </div>

          <div className="timeline-summary-card">
            <span>START TIME</span>
            <strong>{timeline.start}</strong>
          </div>

          <div className="timeline-summary-card">
            <span>COMPLETION TIME</span>
            <strong>{timeline.end}</strong>
          </div>

          <div className="timeline-date">
            Experiment date: {timeline.date}
          </div>

        </div>
      )}

      <div className="timeline-track">

        {timeline.stages.map((stage, index) => (
          <div
            className="timeline-event"
            key={`${strategy}-${stage.icon}`}
          >

            <div className="timeline-marker-column">
              <div className={`timeline-marker ${isRecorded && stage.time ? 'measured' : ''}`}>
                {stage.icon}
              </div>

              {index !== timeline.stages.length - 1 && (
                <div className="timeline-connector" />
              )}
            </div>

            <div className="timeline-event-content">

              <div className="timeline-event-header">
                <h3>{stage.title}</h3>

                <span className={`timeline-event-status ${
                  isRecorded && stage.time ? 'measured' : ''
                }`}>
                  {stage.status}
                </span>
              </div>

              <p>{stage.description}</p>

              {stage.time && (
                <span className="timeline-event-time">
                  {stage.time}
                </span>
              )}

            </div>

          </div>
        ))}

      </div>

      <div className="timeline-note">
        <span className="timeline-note-icon">i</span>
        <p>{timeline.note}</p>
      </div>

    </section>
  );
}

import React from 'react';
import { Card } from 'antd';
import { CheckCircleFilled, LoadingOutlined, RightOutlined, DownOutlined } from '@ant-design/icons';
import { useAppSelector } from '@/app/lib/hooks/hooks';
import {
  selectEditorWorkflowPlanning,
  selectWorkflowSessionDirectory,
} from '@/app/workflows/editorSlice';

interface PlanStep {
  step_number?: string | number;
  description?: string;
  status?: string;
  coworker?: string;
}

interface PlanJson {
  steps?: PlanStep[];
  next_step?: string | number | null;
}

interface PlanBoxProps {
  style?: React.CSSProperties;
  active?: boolean;
  sessionKey?: string;
  isCollapsed?: boolean;
  onToggle?: (next: boolean) => void;
}

const normalizeStatus = (status?: string) => {
  if (!status) return 'NOT_STARTED';
  const s = status.replace(/[-\s]/g, '_').toUpperCase();
  if (s.includes('IN_PROGRESS')) return 'IN_PROGRESS';
  if (s.includes('PROGRESS')) return 'IN_PROGRESS';
  if (s.includes('COMPLETE')) return 'COMPLETED';
  if (s.includes('START')) return 'NOT_STARTED';
  return s as 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
};

const PlanBox: React.FC<PlanBoxProps> = ({ style, active = true, sessionKey, isCollapsed = false, onToggle = () => {} }) => {
  const planningEnabled = useAppSelector(selectEditorWorkflowPlanning);
  const sessionDirectory = useAppSelector(selectWorkflowSessionDirectory);

  const [plan, setPlan] = React.useState<PlanJson | null>(null);
  const [_loading, setLoading] = React.useState<boolean>(false);
  // no per-step expansion; always single-line with ellipsis per requirement

  const resetState = React.useCallback(() => {
    setPlan(null);
  }, []);

  React.useEffect(() => {
    resetState();
  }, [sessionKey, resetState]);

  const fetchPlan = React.useCallback(async () => {
    if (!planningEnabled) return;
    if (!sessionDirectory) return;
    try {
      setLoading(true);
      const listRes = await fetch(
        `/api/file/listDirectory?directoryPath=${encodeURIComponent(sessionDirectory)}`,
      );
      const listData = await listRes.json();
      if (!listRes.ok || !Array.isArray(listData?.files)) return;
      const planFile = listData.files.find(
        (f: any) => f && typeof f.name === 'string' && f.name.toLowerCase() === 'plan.json' && (f.size ?? 0) > 0,
      );
      if (!planFile) {
        setPlan(null);
        return;
      }
      const filePath = encodeURIComponent(planFile.path || `${sessionDirectory}/plan.json`);
      const res = await fetch(`/api/file/download?filePath=${filePath}`);
      if (!res.ok) return;
      const text = await res.text();
      try {
        const json = JSON.parse(text) as PlanJson;
        if (json && Array.isArray(json.steps) && json.steps.length > 0) {
          setPlan(json);
        } else {
          setPlan(null);
        }
      } catch {
        // ignore parse errors
      }
    } finally {
      setLoading(false);
    }
  }, [planningEnabled, sessionDirectory]);

  React.useEffect(() => {
    if (!planningEnabled) return;
    fetchPlan();
  }, [fetchPlan, planningEnabled]);

  React.useEffect(() => {
    if (!planningEnabled) return;
    if (!active) return;
    const id = setInterval(fetchPlan, 5000);
    return () => clearInterval(id);
  }, [fetchPlan, planningEnabled, active]);

  if (!planningEnabled) return <></>;
  if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) return <></>;

  const steps = plan.steps;

  // Determine the current step to spin for NOT_STARTED if none are explicitly in progress
  const anyInProgress = steps.some((s) => normalizeStatus(s.status) === 'IN_PROGRESS');
  let nextStepKey: string | null = null;
  if (plan.next_step !== undefined && plan.next_step !== null && plan.next_step !== '') {
    nextStepKey = String(plan.next_step);
  } else {
    const firstNotStarted = steps
      .map((s) => ({ key: String(s.step_number ?? ''), status: normalizeStatus(s.status) }))
      .find((s) => s.status === 'NOT_STARTED');
    nextStepKey = firstNotStarted ? firstNotStarted.key : null;
  }

  const renderStatusIcon = (s: PlanStep) => {
    const normalized = normalizeStatus(s.status);
    if (normalized === 'COMPLETED') {
      return <CheckCircleFilled style={{ color: '#52c41a', fontSize: 14 }} />;
    }
    if (normalized === 'IN_PROGRESS') {
      return <LoadingOutlined style={{ fontSize: 14 }} spin />;
    }
    // NOT_STARTED
    if (!anyInProgress && nextStepKey && String(s.step_number ?? '') === nextStepKey) {
      return <LoadingOutlined style={{ fontSize: 14 }} spin />;
    }
    return (
      <span
        style={{
          display: 'inline-block',
          width: 14,
          height: 14,
          borderRadius: '50%',
          border: '1px solid #d9d9d9',
          background: '#fff',
        }}
      />
    );
  };

  // No toggle handlers needed for steps; descriptions remain single-line with ellipsis

  return (
    <Card
      size="small"
      bodyStyle={{ padding: 8 }}
      style={{
        background: '#fff',
        border: '1px solid #e8e8e8',
        boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
        borderRadius: 6,
        width: '100%',
        marginBottom: 6,
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div
          onClick={() => onToggle(!isCollapsed)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#000' }}
        >
          {isCollapsed ? (
            <RightOutlined style={{ fontSize: 10, color: 'rgba(0,0,0,0.45)' }} />
          ) : (
            <DownOutlined style={{ fontSize: 10, color: 'rgba(0,0,0,0.45)' }} />
          )}
          <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.95 }}>Plan</div>
        </div>
        <span style={{ fontSize: 10, opacity: 0.8, color: '#000' }}>{steps.length}</span>
      </div>
      {!isCollapsed && (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {steps.map((step, idx) => {
            const key = String(step.step_number ?? idx + 1);
            const description = step.description || '';
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {renderStatusIcon(step)}
                </div>
                <div style={{ flex: 1, minWidth: 0, lineHeight: '16px' }}>
                  <div
                    style={{
                      fontSize: 11,
                      color: '#000',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={description}
                  >
                    {description}
                  </div>
                  {/* No more/less toggle; keep one-line ellipsis */}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

export default PlanBox;


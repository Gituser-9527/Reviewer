import { reviewDecisions } from '@job-compliance/shared';

const modules = [
  ['确定性规则', 'YAML 规则模块已预留，尚未加载生产规则。'],
  ['模型判断', 'LLM Provider 仅定义接口，当前没有供应商实现。'],
  ['法规依据', 'RAG 检索端口已预留，知识库尚未接入。'],
] as const;

export default function HomePage() {
  return (
    <main>
      <header className="masthead">
        <span className="eyebrow">JOB COMPLIANCE / INITIALIZED</span>
        <span className="edition">工程骨架 · 2026</span>
      </header>

      <section className="hero">
        <div>
          <p className="kicker">审核辅助系统</p>
          <h1>
            让每一次岗位发布，
            <br />
            都有据可查。
          </h1>
        </div>
        <p className="intro">
          当前页面用于确认 Web
          工程已正常运行。后续将围绕规则优先、模型辅助、人工复核和完整审计逐步建设。
        </p>
      </section>

      <section className="decision-strip" aria-label="审核结论">
        {reviewDecisions.map((decision, index) => (
          <div key={decision}>
            <span>0{index + 1}</span>
            <strong>{decision}</strong>
          </div>
        ))}
      </section>

      <section className="module-grid">
        {modules.map(([title, description]) => (
          <article key={title}>
            <span className="status-dot" aria-hidden="true" />
            <h2>{title}</h2>
            <p>{description}</p>
          </article>
        ))}
      </section>

      <footer>
        <span>API health</span>
        <code>GET http://localhost:3001/health</code>
      </footer>
    </main>
  );
}

import { useState } from 'react';
import { ProjectPicker } from './project/ProjectPicker';
import { ProjectView } from './project/ProjectView';
import { hydrate, type Layout } from './project/layout';
import { loadLayout, type Project } from './project/projectApi';

type OpenProject = {
  project: Project;
  layout: Layout;
};

export function App() {
  const [open, setOpen] = useState<OpenProject | null>(null);

  async function handleOpen(project: Project) {
    const saved = await loadLayout(project.root);
    setOpen({ project, layout: saved ? hydrate(saved) : null });
  }

  return (
    <main className="app-shell">
      {open ? (
        <ProjectView
          key={open.project.root}
          project={open.project}
          initialLayout={open.layout}
          onClose={() => setOpen(null)}
        />
      ) : (
        <ProjectPicker onOpen={handleOpen} />
      )}
    </main>
  );
}

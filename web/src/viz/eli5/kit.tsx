// What every ELI5 scene shares: its clock, the frame and controls of the detailed scenes, and a
// 480 by 320 stage.
import { useRef, type ReactNode } from "react";
import { SceneFrame, Stage } from "../frame";
import { useInView, useReducedMotion } from "../hooks";
import { useTimeline } from "../timeline";
import { ELI5_SCENES, type Eli5Id } from "./copy";
import "./eli5.css";

export const W = 480;
export const H = 320;

export function useEli5Scene(id: Eli5Id, beats: readonly number[], duration: number) {
  const ref = useRef<HTMLElement>(null);
  const visible = useInView(ref, "0px", 0.3);
  const reduced = useReducedMotion();
  const tl = useTimeline(duration, beats, visible, reduced, true);
  const copy = ELI5_SCENES.find((s) => s.id === id)!;
  return { ref, tl, copy };
}

export function Eli5Frame({ scene, children }: { scene: ReturnType<typeof useEli5Scene>; children: ReactNode }) {
  const { ref, tl, copy } = scene;
  return (
    <SceneFrame sceneRef={ref} tl={tl} copy={copy}>
      <div className="e5-stage px-1 pt-2 pb-1 sm:px-4 sm:pt-4" data-beat={tl.beat}>
        <Stage w={W} h={H} label={copy.figure} className="mx-auto max-h-[30rem]">
          {children}
        </Stage>
      </div>
    </SceneFrame>
  );
}

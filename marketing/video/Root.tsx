import { Composition } from 'remotion';
import { CANVAS, CANVAS_PORTRAIT } from '@shared/brand';
import { Commercial } from './Commercial';
import { Vertical } from './Vertical';

// This project's cuts. Render them with latentedge-os growth/tools/remotion-studio.sh (see marketing/README.md).
export const Root: React.FC = () => (
  <>
    <Composition
      id="watchstander-copilot-commercial"
      component={Commercial}
      durationInFrames={Commercial.durationInFrames}
      fps={Commercial.fps}
      width={CANVAS.width}
      height={CANVAS.height}
    />
    <Composition
      id="watchstander-copilot-vertical"
      component={Vertical}
      durationInFrames={Vertical.durationInFrames}
      fps={Vertical.fps}
      width={CANVAS_PORTRAIT.width}
      height={CANVAS_PORTRAIT.height}
    />
  </>
);

import { useNavigate } from 'react-router-dom';

import { Button } from '../components/ui.jsx';

export function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center px-5 text-center">
      <p className="font-mono text-[11px] tracking-[0.2em] text-brass uppercase">
        404
      </p>
      <h1 className="font-display mt-3 text-4xl text-linen">
        That table is not on our plan
      </h1>
      <p className="mt-3 text-sage">
        The page you were after does not exist. The restaurants, however, do.
      </p>
      <div className="mt-8 flex justify-center">
        <Button onClick={() => navigate('/restaurants')}>Browse restaurants</Button>
      </div>
    </div>
  );
}

import pc from 'picocolors';
import { authService } from '../services/auth.ts';

export async function whoamiAction() {
  const creds = await authService.whoami();
  if (!creds?.user) {
    console.log(pc.dim('Not logged in.'));
    return;
  }
  console.log(creds.user.email);
}

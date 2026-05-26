import pc from 'picocolors';
import { authService } from '../services/auth.ts';

export async function logoutAction() {
  const { wasLoggedIn } = await authService.logout();
  console.log(wasLoggedIn ? pc.green('Signed out.') : pc.dim('Not logged in.'));
}

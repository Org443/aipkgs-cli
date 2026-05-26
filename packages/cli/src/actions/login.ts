import pc from 'picocolors';
import { authService } from '../services/auth.ts';

export async function loginAction({ openBrowser }: { openBrowser: boolean }) {
  try {
    const { credentials } = await authService.login({ openBrowser });

    if (!credentials.user) throw new Error('User was not populated');

    console.log(pc.green(`Logged in as ${pc.bold(credentials.user.email)}.`));
  } catch (err) {
    console.error(pc.red(`login failed: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  }
}

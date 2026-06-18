import { Button } from "@/components/ui";
import { logoutAction } from "@/app/[locale]/(app)/account-actions";

interface UserMenuProps {
  userName: string;
  locale: string;
  labels: {
    greeting: string;
    logout: string;
  };
}

/**
 * Authenticated user indicator + logout. Logout is a real <form> posting to a
 * Server Action (`logoutAction`) — a state-changing op behind a POST with the
 * built-in Next.js Server Action CSRF protection, not a GET link (docs/06 §6.4).
 * The user name is shown alongside; the greeting label names the control for AT.
 */
export function UserMenu({ userName, locale, labels }: UserMenuProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="hidden font-body text-[13px] text-muted sm:inline">
        <span className="sr-only">{labels.greeting} </span>
        {userName}
      </span>
      <form action={logoutAction}>
        <input type="hidden" name="locale" value={locale} />
        <Button type="submit" variant="ghost" size="sm">
          {labels.logout}
        </Button>
      </form>
    </div>
  );
}

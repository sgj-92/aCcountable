# Home-screen widgets

aCcountable has one widget, **Macros**: today's calories, protein, fat and carbs against the
day's targets, with a bar for each (over target turns red). It's built with `expo-widgets`:

- `src/widgets/macros.ios.tsx`: iOS (SwiftUI). Small and medium home-screen sizes, plus a
  Lock Screen size (calories and a bar, then P · F · C).
- `src/widgets/macros.android.tsx`: Android (Jetpack Compose / Glance). A resizable 2×2
  widget.
- `src/widgets/macros.tsx`: web, does nothing.

Today updates the widget whenever what you've eaten or the targets change. At midnight the
widget shows a fresh day (nothing eaten, targets "– / –") until the app is next opened.
On iOS that happens on its own; on Android, when the system redraws the widget.

## Adding it

- **iPhone:** long-press the home screen → **Edit** → **Add Widget** → search
  **aCcountable** → Macros.
- **Android:** long-press the home screen → **Widgets** → **aCcountable** → Macros.

## One-time iOS setup (from a Mac)

On iOS a widget is an app extension with its own signing and an App Group shared with the
app. That signing has to be created once while signed in to Apple, which the GitHub
workflow can't do. Until it exists, the workflow's iOS build step fails with a warning;
Android carries on. Run one build from the Mac's Terminal:

```bash
git clone https://github.com/sgj-92/aCcountable.git && cd aCcountable
```

```bash
git checkout claude/keen-sagan-zqk0hi && npm ci
```

```bash
npx eas-cli@latest build --platform ios --profile production --auto-submit
```

Sign in to Expo and to your Apple account when asked, and say **yes** to letting EAS manage
the credentials. It sets up signing for the app and the widget, registers the App Group,
builds, and sends the build to TestFlight. After that, GitHub's builds and over-the-air
updates work as before.

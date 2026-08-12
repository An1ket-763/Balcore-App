declare module "./Onboarding" {
  export default function Onboarding(props: { onComplete: (name: string) => void }): JSX.Element;
}

declare module "./Sidebar" {
  export default function Sidebar(props: { displayName?: string }): JSX.Element;
}

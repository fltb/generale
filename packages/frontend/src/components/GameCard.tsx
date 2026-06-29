import { A } from "@solidjs/router";
import { Show } from "solid-js";
import type { Component } from "solid-js";
import { Button } from "~/ui";
import { useT } from "~/i18n/useT";

export interface GameCardProps {
  title: string;
  description: string;
  href: string;
  meta?: string;
  comingSoon?: boolean;
}

const GameCard: Component<GameCardProps> = (props) => {
  const { t } = useT();
  return (
    <div class={`bg-base-100 border-2 border-base-300 p-5 flex flex-col ${props.comingSoon ? "opacity-50" : ""}`}>
      <div class="w-full h-36 bg-base-200 border border-base-300 flex items-center justify-center mb-4 text-base-content/30 text-sm">
        {props.comingSoon ? "❓" : "🎮 Screenshot"}
      </div>
      <h3 class="text-lg text-primary mb-2">{props.title}</h3>
      <p class="text-sm text-base-content/60 mb-3 flex-1">{props.description}</p>
      <Show when={props.meta}>
        <span class="text-xs text-success mb-3">{props.meta}</span>
      </Show>
      <Show when={!props.comingSoon}>
        <A href={props.href} class="self-start">
          <Button variant="primary" size="sm">
            {t("Play")}
          </Button>
        </A>
      </Show>
    </div>
  );
};

export default GameCard;

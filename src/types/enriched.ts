import type { Ausleihen, Schaeden, Wartungen, Werkzeuge } from './app';

export type EnrichedWerkzeuge = Werkzeuge & {
  ersatz_fuerName: string;
};

export type EnrichedAusleihen = Ausleihen & {
  werkzeugName: string;
  mitarbeiterName: string;
};

export type EnrichedWartungen = Wartungen & {
  werkzeugName: string;
};

export type EnrichedSchaeden = Schaeden & {
  werkzeugName: string;
};

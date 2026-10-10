import next from "eslint-config-next";

export default [
  ...next,
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
  {
    rules: {
      // Reading localStorage / fetching on mount legitimately sets state inside effects (client-only data).
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

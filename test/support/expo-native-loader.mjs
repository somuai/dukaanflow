const mocksUrl = new URL('./expo-native-mocks.mjs', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'expo-sqlite' || specifier === 'expo-crypto') {
    return { url: mocksUrl, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

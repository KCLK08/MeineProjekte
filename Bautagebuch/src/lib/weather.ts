const WEATHER_CATEGORY_KEYWORDS: Record<string, string[][]> = {
  clear: [['klar', 'sonnig', 'sonne', 'heiter', 'clear', 'sunny']],
  partly_cloudy: [
    ['teils bewölkt', 'teilweise bewölkt', 'leicht bewölkt', 'partly cloudy', 'wolkig'],
    ['bewölkt', 'heiter', 'klar'],
  ],
  cloudy: [['bedeckt', 'stark bewölkt', 'overcast', 'cloudy', 'bewölkt']],
  fog: [['nebel', 'fog', 'mist']],
  rain: [['regen', 'regnerisch', 'schauer', 'niesel', 'drizzle', 'rain']],
  snow: [['schnee', 'schneefall', 'graupel', 'snow', 'sleet']],
  thunder: [['gewitter', 'thunder', 'sturm']],
};

function weatherCategoryFromCode(code: number): string {
  if (code === 0) return 'clear';
  if ([1, 2].includes(code)) return 'partly_cloudy';
  if ([3].includes(code)) return 'cloudy';
  if ([45, 48].includes(code)) return 'fog';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([95, 96, 99].includes(code)) return 'thunder';
  return 'partly_cloudy';
}

function normalizeOption(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function pickWeatherDropdownOption(options: string[] = [], weatherCode: number): string {
  const category = weatherCategoryFromCode(weatherCode);
  const keywordGroups = WEATHER_CATEGORY_KEYWORDS[category] || [];
  const normalizedOptions = options.map((o) => ({ raw: o, norm: normalizeOption(o) }));

  for (const group of keywordGroups) {
    for (const keyword of group) {
      const normKeyword = normalizeOption(keyword);
      const match = normalizedOptions.find((o) => o.norm.includes(normKeyword));
      if (match) return match.raw;
    }
  }

  return options[0] || '';
}

export function formatTemperatureValue(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return '';
  return `${Math.round(Number(value))}`;
}

export async function fetchCurrentWeatherForCoordinates(latitude: number, longitude: number) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set('current', 'weather_code,temperature_2m');
  url.searchParams.set('daily', 'weather_code,temperature_2m_min,temperature_2m_max');
  url.searchParams.set('timezone', 'auto');

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error('Wetterdaten konnten nicht geladen werden.');
  }

  const data = await response.json();
  const current = data?.current || data?.current_weather || {};
  const daily = data?.daily || {};
  const currentCode = Number(current.weather_code ?? current.weathercode);
  const dailyCode = Number((daily.weather_code || daily.weathercode || [])[0]);
  const weatherCode = Number.isFinite(currentCode) ? currentCode : dailyCode;
  const tempMin = Number((daily.temperature_2m_min || [])[0]);
  const tempMax = Number((daily.temperature_2m_max || [])[0]);

  return {
    weatherCode,
    tempMin: Number.isFinite(tempMin) ? tempMin : Number(current.temperature_2m),
    tempMax: Number.isFinite(tempMax) ? tempMax : Number(current.temperature_2m),
  };
}

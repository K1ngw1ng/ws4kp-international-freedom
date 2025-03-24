// current weather conditions display
import STATUS from './status.mjs';
import { loadImg } from './utils/image.mjs';
import { directionToNSEW } from './utils/calc.mjs';
import { getWeatherIconFromIconLink } from './icons.mjs';
import WeatherDisplay from './weatherdisplay.mjs';
import { registerDisplay } from './navigation.mjs';
import { getConditionText } from './utils/weather.mjs';

class CurrentWeather extends WeatherDisplay {
	constructor(navId, elemId) {
		super(navId, elemId, 'Current Conditions', true);
		// pre-load background image (returns promise)
		this.backgroundImage = loadImg('images/BackGround1_1.png');
	}

	async getData(_weatherParameters) {
		// always load the data for use in the lower scroll
		const superResult = super.getData(_weatherParameters);
		const weatherParameters = _weatherParameters ?? this.weatherParameters;

		// we only get here if there was no error above
		this.data = parseData(weatherParameters);
		this.getDataCallback();

		// stop here if we're disabled
		if (!superResult) return;

		this.setStatus(STATUS.loaded);
	}

	async drawCanvas() {
		super.drawCanvas();

		let condition = getConditionText(this.data.TextConditions);
		if (condition.length > 15) {
			condition = shortConditions(condition);
		}

		const iconImage = getWeatherIconFromIconLink(condition, this.data.timeZone);

		const fill = {
			temp: this.data.Temperature + String.fromCharCode(176),
			condition,
			wind: this.data.WindDirection.padEnd(3, '') + this.data.WindSpeed.toString().padStart(3, ' '),
			location: this.data.city,
			humidity: `${this.data.Humidity}%`,
			dewpoint: this.data.DewPoint + String.fromCharCode(176),
			ceiling: (this.data.Ceiling === 0 ? 'Unlimited' : this.data.Ceiling + this.data.CeilingUnit),
			visibility: this.data.Visibility + this.data.VisibilityUnit,
			pressure: `${this.data.Pressure} ${this.data.PressureDirection}`,
			icon: { type: 'img', src: iconImage },
		};

		if (this.data.WindGust) fill['wind-gusts'] = `Gusts to ${this.data.WindGust}`;

		const area = this.elem.querySelector('.main');

		area.innerHTML = '';
		area.append(this.fillTemplate('weather', fill));

		this.finishDraw();
	}

	// make data available outside this class
	// promise allows for data to be requested before it is available
	async getCurrentWeather(stillWaiting) {
		if (stillWaiting) this.stillWaitingCallbacks.push(stillWaiting);
		return new Promise((resolve) => {
			if (this.data) resolve(this.data);
			// data not available, put it into the data callback queue
			this.getDataCallbacks.push(() => resolve(this.data));
		});
	}
}

const shortConditions = (_condition) => {
	let condition = _condition;
	condition = condition.replace(/Light/g, 'L');
	condition = condition.replace(/Heavy/g, 'H');
	condition = condition.replace(/Partly/g, 'P');
	condition = condition.replace(/Mostly/g, 'M');
	condition = condition.replace(/Few/g, 'F');
	condition = condition.replace(/Thunderstorm/g, 'T\'storm');
	condition = condition.replace(/ in /g, '');
	condition = condition.replace(/Vicinity/g, '');
	condition = condition.replace(/ and /g, ' ');
	condition = condition.replace(/Freezing Rain/g, 'Frz Rn');
	condition = condition.replace(/Freezing/g, 'Frz');
	condition = condition.replace(/Unknown Precip/g, '');
	condition = condition.replace(/L Snow Fog/g, 'L Snw/Fog');
	condition = condition.replace(/ with /g, '/');
	return condition;
};

const getCurrentWeatherByHourFromTime = (data) => {
	const currentTime = new Date();
	const onlyDate = currentTime.toISOString().split('T')[0]; // Extracts "YYYY-MM-DD"

	const availableTimes = data.forecast[onlyDate].hours;

	const closestTime = availableTimes.reduce((prev, curr) => {
		const prevDiff = Math.abs(new Date(prev.time) - currentTime);
		const currDiff = Math.abs(new Date(curr.time) - currentTime);
		return currDiff < prevDiff ? curr : prev;
	});

	return closestTime;
};

// format the received data
const parseData = (data) => {
	const currentForecast = getCurrentWeatherByHourFromTime(data);

// Convert metric values to American units
	data.Temperature = Math.round((currentForecast.temperature_2m * 9/5) + 32);
	data.TemperatureUnit = 'F';
	data.DewPoint = Math.round((currentForecast.dew_point_2m * 9/5) + 32);
	data.Ceiling = Math.round(currentForecast.cloud_cover * 3.281);
	data.CeilingUnit = 'ft';
	data.Visibility = Math.round(currentForecast.visibility * 0.000621371);
	data.VisibilityUnit = 'mi';
	data.WindSpeed = Math.round(currentForecast.wind_speed_10m * 0.621371);
	data.WindDirection = directionToNSEW(currentForecast.wind_direction_10m);
	data.Pressure = Math.round(currentForecast.pressure_msl * 0.02953);
	data.PressureDirection = 'inHg';
	data.WindGust = Math.round(currentForecast.wind_gusts_10m * 0.621371);
	data.WindUnit = 'mph';
	data.Humidity = Math.round(currentForecast.relative_humidity_2m);
	data.TextConditions = currentForecast.weather_code;

return data;


const display = new CurrentWeather(1, 'current-weather');
registerDisplay(display);

export default display.getCurrentWeather.bind(display);

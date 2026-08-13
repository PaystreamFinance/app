/**
 * Axios Wrapper for Performance Tracking
 *
 * Wraps axios calls to automatically track external API performance
 */

import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from "axios";
import { trackAxiosCall } from "./external-api-tracker";

/**
 * Creates an axios instance with automatic performance tracking
 */
export function createTrackedAxiosInstance(
  config?: AxiosRequestConfig,
): AxiosInstance {
  const instance = axios.create(config);

  // Add request interceptor to track start time
  instance.interceptors.request.use(
    (config) => {
      // Store start time in config metadata
      (config as unknown as { _startTime?: number })._startTime =
        performance.now();
      return config;
    },
    (error) => {
      return Promise.reject(error);
    },
  );

  // Add response interceptor to track completion
  instance.interceptors.response.use(
    async (response: AxiosResponse) => {
      const config = response.config as unknown as { _startTime?: number };
      const startTime = config._startTime ?? performance.now();

      await trackAxiosCall(
        response.config.url ?? "unknown",
        response.config.method?.toUpperCase() ?? "GET",
        async () => ({
          data: response.data,
          status: response.status,
          headers: response.headers as Record<string, string>,
        }),
      );

      return response;
    },
    async (error) => {
      const config = error.config as unknown as { _startTime?: number };
      const startTime = config._startTime ?? performance.now();

      if (error.config) {
        await trackAxiosCall(
          error.config.url ?? "unknown",
          error.config.method?.toUpperCase() ?? "GET",
          async () => {
            throw error;
          },
        );
      }

      return Promise.reject(error);
    },
  );

  return instance;
}

// Export a default tracked instance
export const trackedAxios = createTrackedAxiosInstance();

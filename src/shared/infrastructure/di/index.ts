import 'reflect-metadata';
import { container, configureContainer } from './container';
import * as tokens from './tokens';

// Configure the container on module load
configureContainer();

// Export everything needed by the application
export { container, tokens };

// Helper function to get services
export function getService<T>(token: symbol): T {
  return container.resolve<T>(token);
}
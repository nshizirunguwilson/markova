export class ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;

  static ok<T>(data: T, message?: string): ApiResponse<T> {
    const response = new ApiResponse<T>();
    response.success = true;
    response.data = data;
    response.message = message;
    return response;
  }

  static error(message: string): ApiResponse<null> {
    const response = new ApiResponse<null>();
    response.success = false;
    response.message = message;
    return response;
  }
}

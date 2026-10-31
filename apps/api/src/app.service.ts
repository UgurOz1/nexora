import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getInfo() {
    return { name: 'nexora-api', status: 'ok' };
  }
}

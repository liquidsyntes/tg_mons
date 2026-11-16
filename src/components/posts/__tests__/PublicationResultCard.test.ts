/** @vitest-environment jsdom */
import React from 'react';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {it,expect,vi,afterEach} from 'vitest';
import {PublicationResultCard} from '../PublicationResultCard';
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('shows zero as measured and distinguishes missing checkpoints',()=>{
 render(React.createElement(PublicationResultCard,{disabled:false,onLink:vi.fn(),result:{state:'linked',channelTitle:'Test',points:[{hours:24,state:'measured',views:0,capturedAt:'2026-11-11T00:00:00Z',actualAgeHours:24,median:null,sampleSize:0,delta:null,deltaPercent:null},{hours:48,state:'missed',views:null,capturedAt:null,actualAgeHours:null,median:null,sampleSize:0,delta:null,deltaPercent:null}]}}));
 expect(screen.getByText('24 ч: 0 просмотров')).toBeDefined();expect(screen.getByText('48 ч: Окно замера пропущено')).toBeDefined();
});
it('selects a collected publication and unlinks without submitting a status',async()=>{
 const link=vi.fn().mockResolvedValue(undefined);
 vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({posts:[{id:9,publishedAt:'2026-11-10',text:'My publication'}],hasMore:false,noMyChannel:false})));
 render(React.createElement(PublicationResultCard,{disabled:false,onLink:link,result:{state:'linked'}}));
 fireEvent.click(screen.getByRole('button',{name:'Сменить публикацию'}));
 fireEvent.click(await screen.findByRole('button',{name:/My publication/}));expect(link).toHaveBeenCalledWith(9);
 fireEvent.click(screen.getByRole('button',{name:'Отвязать'}));expect(link).toHaveBeenCalledWith(null);
});

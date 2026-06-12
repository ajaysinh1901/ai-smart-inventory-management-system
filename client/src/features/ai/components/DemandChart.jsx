import React from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';

const data = [
  { month: 'Jan', actual: 4000, predicted: 4200 },
  { month: 'Feb', actual: 3000, predicted: 3200 },
  { month: 'Mar', actual: 5000, predicted: 4800 },
  { month: 'Apr', actual: 4500, predicted: 4600 },
  { month: 'May', actual: 6000, predicted: 5900 },
  { month: 'Jun', actual: 7200, predicted: 7500 },
];

export default function DemandChart() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
          </linearGradient>
          <linearGradient id="colorPredicted" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3}/>
            <stop offset="95%" stopColor="#ec4899" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff1a" vertical={false} />
        <XAxis dataKey="month" stroke="#ffffff50" tick={{ fill: '#ffffff80', fontSize: 12 }} axisLine={false} tickLine={false} dy={10} />
        <YAxis stroke="#ffffff50" tick={{ fill: '#ffffff80', fontSize: 12 }} axisLine={false} tickLine={false} dx={-10} />
        <Tooltip 
          contentStyle={{ backgroundColor: '#12121a', border: '1px solid #ffffff20', borderRadius: '8px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)' }}
          itemStyle={{ color: '#fff' }}
        />
        <Area 
          type="monotone" 
          dataKey="predicted" 
          stroke="#ec4899" 
          strokeWidth={2}
          strokeDasharray="5 5"
          fillOpacity={1} 
          fill="url(#colorPredicted)" 
          name="AI Prediction"
        />
        <Area 
          type="monotone" 
          dataKey="actual" 
          stroke="#6366f1" 
          strokeWidth={3}
          fillOpacity={1} 
          fill="url(#colorActual)" 
          name="Actual Demand"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
